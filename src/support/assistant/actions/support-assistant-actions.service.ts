import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentsService } from '../../../appointments/appointments.service';
import { ProfessionalAbsencesService } from '../../../professional-absences/professional-absences.service';
import { ProfessionalsService } from '../../../professionals/professionals.service';
import { SupabaseService } from '../../../supabase/supabase.service';
import type { TenantAccessContext } from '../../../tenants/entities/tenant-access-context.entity';
import {
  assertProfessionalSelfScope,
  resolveLinkedProfessionalId,
  resolveScopedProfessionalId,
} from '../../../tenants/utils/tenant-user-scope.util';
import { SupportAssistantRepository } from '../support-assistant.repository';
import {
  buildAbsenceRangeIso,
  extractSupportActionPropose,
} from './support-action-sanitize.util';
import { SupportActionProposalStore } from './support-action-proposal.store';
import type {
  SupportActionExecuteResult,
  SupportActionPayload,
  SupportCancelAppointmentPayload,
  SupportCreateAbsencePayload,
  SupportParsedActionPropose,
  SupportProposedActionCard,
} from './support-action.types';

const CANCELLABLE_STATUSES = [
  'PENDING',
  'PENDING_PAYMENT',
  'PENDING_APPROVAL',
  'CONFIRMED',
] as const;

@Injectable()
export class SupportAssistantActionsService {
  private readonly logger = new Logger(SupportAssistantActionsService.name);

  constructor(
    private readonly proposalStore: SupportActionProposalStore,
    private readonly repository: SupportAssistantRepository,
    private readonly professionalAbsencesService: ProfessionalAbsencesService,
    private readonly appointmentsService: AppointmentsService,
    private readonly professionalsService: ProfessionalsService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * After LLM output: extract action, build preview card (or null).
   */
  async enrichAssistantOutput(params: {
    context: TenantAccessContext;
    userId: string;
    conversationId: string;
    assistantContent: string;
  }): Promise<{
    displayContent: string;
    proposedAction: SupportProposedActionCard | null;
  }> {
    const extracted = extractSupportActionPropose(params.assistantContent);
    if (!extracted.action) {
      return {
        displayContent: extracted.displayContent,
        proposedAction: null,
      };
    }

    try {
      const card = await this.buildPreviewCard({
        context: params.context,
        userId: params.userId,
        conversationId: params.conversationId,
        action: extracted.action,
      });
      return {
        displayContent: extracted.displayContent,
        proposedAction: card,
      };
    } catch (error) {
      const message =
        error instanceof BadRequestException || error instanceof NotFoundException
          ? error.message
          : 'Não foi possível preparar a ação. Peça mais detalhes ou use o painel.';
      this.logger.warn(`Action preview failed: ${message}`);
      return {
        displayContent: `${extracted.displayContent}\n\n${message}`.trim(),
        proposedAction: null,
      };
    }
  }

  async executeProposal(params: {
    context: TenantAccessContext;
    userId: string;
    proposalId: string;
    confirmCancelConflicting?: boolean;
  }): Promise<SupportActionExecuteResult> {
    const proposal = this.proposalStore.getForUser({
      proposalId: params.proposalId,
      tenantId: params.context.tenant.id,
      userId: params.userId,
    });

    if (!proposal) {
      throw new BadRequestException(
        'Esta proposta expirou ou é inválida. Envie a mensagem novamente.',
      );
    }

    try {
      if (proposal.type === 'create_absence') {
        const result = await this.executeCreateAbsence({
          context: params.context,
          proposal,
          confirmCancelConflicting: params.confirmCancelConflicting === true,
        });
        this.proposalStore.delete(proposal.id);
        await this.repository.insertAuditEvent({
          tenantId: params.context.tenant.id,
          userId: params.userId,
          conversationId: proposal.conversationId,
          eventType: 'action_executed',
          metadata: { type: proposal.type },
        });
        return result;
      }

      const result = await this.executeCancelAppointment({
        context: params.context,
        proposal,
      });
      this.proposalStore.delete(proposal.id);
      await this.repository.insertAuditEvent({
        tenantId: params.context.tenant.id,
        userId: params.userId,
        conversationId: proposal.conversationId,
        eventType: 'action_executed',
        metadata: { type: proposal.type },
      });
      return result;
    } catch (error) {
      await this.repository.insertAuditEvent({
        tenantId: params.context.tenant.id,
        userId: params.userId,
        conversationId: proposal.conversationId,
        eventType: 'action_rejected',
        metadata: {
          type: proposal.type,
          reason: error instanceof Error ? error.message : 'error',
        },
      });
      throw error;
    }
  }

  async dismissProposal(params: {
    context: TenantAccessContext;
    userId: string;
    proposalId: string;
  }): Promise<{ success: true }> {
    const proposal = this.proposalStore.getForUser({
      proposalId: params.proposalId,
      tenantId: params.context.tenant.id,
      userId: params.userId,
    });

    if (proposal) {
      this.proposalStore.delete(proposal.id);
      await this.repository.insertAuditEvent({
        tenantId: params.context.tenant.id,
        userId: params.userId,
        conversationId: proposal.conversationId,
        eventType: 'action_rejected',
        metadata: { type: proposal.type, reason: 'dismissed' },
      });
    }

    return { success: true };
  }

  private async buildPreviewCard(params: {
    context: TenantAccessContext;
    userId: string;
    conversationId: string;
    action: SupportParsedActionPropose;
  }): Promise<SupportProposedActionCard> {
    if (params.action.type === 'create_absence') {
      return this.previewCreateAbsence(params);
    }
    return this.previewCancelAppointment(params);
  }

  private async previewCreateAbsence(params: {
    context: TenantAccessContext;
    userId: string;
    conversationId: string;
    action: SupportParsedActionPropose;
  }): Promise<SupportProposedActionCard> {
    const payload = params.action.payload as SupportCreateAbsencePayload;
    const professionalId = await this.resolveProfessionalIdForAbsence(
      params.context,
      payload.professionalId,
    );

    const range = buildAbsenceRangeIso(payload);
    const scopedProfessionalId = resolveScopedProfessionalId(
      params.context.tenantUser,
    );

    const conflicts =
      await this.appointmentsService.findConflictingAppointmentsForAbsenceRange(
        params.context.tenant.id,
        professionalId,
        range,
        scopedProfessionalId,
      );

    const professional =
      await this.professionalsService.assertProfessionalBelongsToTenant(
        professionalId,
        params.context.tenant.id,
      );

    const proposal = this.proposalStore.create({
      tenantId: params.context.tenant.id,
      userId: params.userId,
      conversationId: params.conversationId,
      action: params.action,
      resolvedProfessionalId: professionalId,
      conflictCount: conflicts.length,
      cancelConflicting: false,
    });

    await this.repository.insertAuditEvent({
      tenantId: params.context.tenant.id,
      userId: params.userId,
      conversationId: params.conversationId,
      eventType: 'action_previewed',
      metadata: {
        type: 'create_absence',
        conflictCount: conflicts.length,
      },
    });

    const isAllDay = payload.allDay !== false && (!payload.startTime || !payload.endTime);
    const periodLabel = isAllDay
      ? `Dia inteiro em ${payload.date}`
      : `${payload.date} das ${payload.startTime} às ${payload.endTime}`;

    const warnings: string[] = [];
    if (conflicts.length > 0) {
      warnings.push(
        `Há ${conflicts.length} agendamento(s) nesse período. Ao confirmar, eles serão cancelados.`,
      );
    }

    return {
      id: proposal.id,
      type: 'create_absence',
      summary: `Registrar ausência${professional?.name ? ` de ${professional.name}` : ''}`,
      details: {
        period: periodLabel,
        professional: professional?.name ?? professionalId,
        reason: payload.reason ?? '—',
      },
      warnings,
      requiresCancelConflicting: conflicts.length > 0,
      conflictCount: conflicts.length,
    };
  }

  private async previewCancelAppointment(params: {
    context: TenantAccessContext;
    userId: string;
    conversationId: string;
    action: SupportParsedActionPropose;
  }): Promise<SupportProposedActionCard> {
    const payload = params.action.payload as SupportCancelAppointmentPayload;
    const match = await this.resolveUniqueAppointment(params.context, payload);

    if (match.kind === 'none') {
      throw new BadRequestException(
        'Não encontrei um agendamento com esses dados. Informe a data e o horário (ex.: amanhã às 15:00).',
      );
    }

    if (match.kind === 'many') {
      throw new BadRequestException(
        `Encontrei ${match.count} agendamentos parecidos. Seja mais específico (horário ou nome do cliente) ou abra a Agenda.`,
      );
    }

    const appointment = match.appointment;
    const proposal = this.proposalStore.create({
      tenantId: params.context.tenant.id,
      userId: params.userId,
      conversationId: params.conversationId,
      action: params.action,
      resolvedAppointmentId: appointment.id,
    });

    await this.repository.insertAuditEvent({
      tenantId: params.context.tenant.id,
      userId: params.userId,
      conversationId: params.conversationId,
      eventType: 'action_previewed',
      metadata: { type: 'cancel_appointment' },
    });

    return {
      id: proposal.id,
      type: 'cancel_appointment',
      summary: 'Cancelar agendamento',
      details: {
        when: appointment.startTime,
        customer: appointment.customerName || 'Cliente',
        service: appointment.serviceName || 'Serviço',
        professional: appointment.professionalName || 'Profissional',
        status: appointment.status,
      },
    };
  }

  private async executeCreateAbsence(params: {
    context: TenantAccessContext;
    proposal: {
      id: string;
      payload: SupportActionPayload;
      resolvedProfessionalId?: string;
      conflictCount: number;
    };
    confirmCancelConflicting: boolean;
  }): Promise<SupportActionExecuteResult> {
    const payload = params.proposal.payload as SupportCreateAbsencePayload;
    const professionalId = params.proposal.resolvedProfessionalId;
    if (!professionalId) {
      throw new BadRequestException('Profissional não resolvido na proposta.');
    }

    await this.assertProfessionalAccess(params.context, professionalId);
    const range = buildAbsenceRangeIso(payload);
    const scopedProfessionalId = resolveScopedProfessionalId(
      params.context.tenantUser,
    );

    const conflicts =
      await this.appointmentsService.findConflictingAppointmentsForAbsenceRange(
        params.context.tenant.id,
        professionalId,
        range,
        scopedProfessionalId,
      );

    if (conflicts.length > 0 && !params.confirmCancelConflicting) {
      throw new BadRequestException(
        'Existem agendamentos no período. Confirme o cancelamento deles para registrar a ausência.',
      );
    }

    await this.professionalAbsencesService.createForProfessional(
      params.context.tenant.id,
      professionalId,
      {
        startsAt: range.startsAt,
        endsAt: range.endsAt,
        reason: payload.reason,
        cancelConflicting: params.confirmCancelConflicting,
      },
    );

    if (params.confirmCancelConflicting && conflicts.length > 0) {
      for (const appointment of conflicts) {
        await this.appointmentsService.updateStatusForTenant(
          params.context.tenant.id,
          appointment.id,
          'CANCELLED',
          scopedProfessionalId,
        );
      }
    }

    return {
      success: true,
      message:
        conflicts.length > 0 && params.confirmCancelConflicting
          ? `Ausência registrada. ${conflicts.length} agendamento(s) conflitante(s) foram cancelados.`
          : 'Ausência registrada com sucesso.',
      gotoPath: '/admin/meu-perfil',
    };
  }

  private async executeCancelAppointment(params: {
    context: TenantAccessContext;
    proposal: {
      resolvedAppointmentId?: string;
    };
  }): Promise<SupportActionExecuteResult> {
    const appointmentId = params.proposal.resolvedAppointmentId;
    if (!appointmentId) {
      throw new BadRequestException('Agendamento não resolvido na proposta.');
    }

    const scopedProfessionalId = resolveScopedProfessionalId(
      params.context.tenantUser,
    );

    await this.appointmentsService.updateStatusForTenant(
      params.context.tenant.id,
      appointmentId,
      'CANCELLED',
      scopedProfessionalId,
    );

    return {
      success: true,
      message: 'Agendamento cancelado com sucesso.',
      gotoPath: '/admin/agenda',
    };
  }

  private async resolveProfessionalIdForAbsence(
    context: TenantAccessContext,
    requestedId?: string,
  ): Promise<string> {
    const role = context.tenantUser.role;
    const linked = resolveLinkedProfessionalId(context.tenantUser);

    if (role === 'PROFESSIONAL') {
      if (!linked) {
        throw new BadRequestException(
          'Sua conta ainda não está vinculada a um perfil de atendimento. Peça ao dono para vincular em Equipe.',
        );
      }
      return linked;
    }

    if (requestedId) {
      await this.professionalsService.assertProfessionalBelongsToTenant(
        requestedId,
        context.tenant.id,
      );
      return requestedId;
    }

    if (linked) {
      return linked;
    }

    throw new BadRequestException(
      'Informe qual profissional ficará ausente, ou vincule seu perfil em Equipe / Meu perfil.',
    );
  }

  private async assertProfessionalAccess(
    context: TenantAccessContext,
    professionalId: string,
  ): Promise<void> {
    const scoped = resolveScopedProfessionalId(context.tenantUser);
    assertProfessionalSelfScope(scoped, professionalId);
    await this.professionalsService.assertProfessionalBelongsToTenant(
      professionalId,
      context.tenant.id,
    );
  }

  private async resolveUniqueAppointment(
    context: TenantAccessContext,
    payload: SupportCancelAppointmentPayload,
  ): Promise<
    | { kind: 'none' }
    | { kind: 'many'; count: number }
    | {
        kind: 'one';
        appointment: {
          id: string;
          startTime: string;
          customerName: string;
          serviceName: string;
          professionalName: string;
          status: string;
        };
      }
  > {
    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );

    if (payload.appointmentId) {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('appointments')
        .select(
          `
          id,
          start_time,
          status,
          customer_name,
          professional_id,
          professionals ( name ),
          services!service_id ( name )
        `,
        )
        .eq('id', payload.appointmentId)
        .eq('tenant_id', context.tenant.id)
        .maybeSingle();

      if (error) {
        throw new BadRequestException(error.message);
      }
      if (!data) {
        return { kind: 'none' };
      }
      if (
        scopedProfessionalId &&
        data.professional_id !== scopedProfessionalId
      ) {
        return { kind: 'none' };
      }
      if (
        !CANCELLABLE_STATUSES.includes(
          data.status as (typeof CANCELLABLE_STATUSES)[number],
        )
      ) {
        throw new BadRequestException(
          'Esse agendamento não pode ser cancelado pelo assistente (já concluído ou cancelado).',
        );
      }

      return {
        kind: 'one',
        appointment: this.mapAppointmentRow(data),
      };
    }

    if (!payload.date) {
      return { kind: 'none' };
    }

    let query = this.supabaseService
      .getClient()
      .from('appointments')
      .select(
        `
        id,
        start_time,
        status,
        customer_name,
        professional_id,
        professionals ( name ),
        services!service_id ( name )
      `,
      )
      .eq('tenant_id', context.tenant.id)
      .in('status', [...CANCELLABLE_STATUSES])
      .gte('start_time', `${payload.date}T00:00:00`)
      .lte('start_time', `${payload.date}T23:59:59`)
      .order('start_time', { ascending: true })
      .limit(20);

    if (scopedProfessionalId) {
      query = query.eq('professional_id', scopedProfessionalId);
    }

    const { data, error } = await query;
    if (error) {
      throw new BadRequestException(error.message);
    }

    let rows = data ?? [];

    if (payload.time) {
      const [hour, minute] = payload.time.split(':').map(Number);
      rows = rows.filter((row) => {
        const match = String(row.start_time).match(/T(\d{2}):(\d{2})/);
        if (!match) return false;
        return Number(match[1]) === hour && Number(match[2]) === minute;
      });
    }

    if (payload.customerNameHint) {
      const hint = payload.customerNameHint.toLowerCase();
      rows = rows.filter((row) =>
        String(row.customer_name ?? '')
          .toLowerCase()
          .includes(hint),
      );
    }

    if (rows.length === 0) {
      return { kind: 'none' };
    }
    if (rows.length > 1) {
      return { kind: 'many', count: rows.length };
    }

    return {
      kind: 'one',
      appointment: this.mapAppointmentRow(rows[0]),
    };
  }

  private mapAppointmentRow(row: {
    id: string;
    start_time: string;
    status: string;
    customer_name: string | null;
    professionals: { name: string } | { name: string }[] | null;
    services: { name: string } | { name: string }[] | null;
  }): {
    id: string;
    startTime: string;
    customerName: string;
    serviceName: string;
    professionalName: string;
    status: string;
  } {
    const professionalName = Array.isArray(row.professionals)
      ? row.professionals[0]?.name
      : row.professionals?.name;
    const serviceName = Array.isArray(row.services)
      ? row.services[0]?.name
      : row.services?.name;

    return {
      id: row.id,
      startTime: row.start_time,
      customerName: row.customer_name ?? 'Cliente',
      serviceName: serviceName ?? 'Serviço',
      professionalName: professionalName ?? 'Profissional',
      status: row.status,
    };
  }
}
