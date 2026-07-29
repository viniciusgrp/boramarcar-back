import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { ProfessionalBookingAcceptanceType } from '../booking/entities/booking-acceptance-type.type';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import type { PlanTier } from '../tenants/entities/plan-tier.type';
import { TenantUsersService } from '../tenants/tenant-users.service';
import {
  canAddActiveProfessional,
  getProfessionalLimitMessage,
} from '../tenants/utils/plan-tier.util';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProfessionalDto } from './dto/create-professional.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import {
  ARCHIVED_PROFESSIONAL_MATCH_CODE,
  type ArchivedProfessionalMatchResponse,
} from './entities/archived-professional-match.entity';
import { Professional } from './entities/professional.entity';
import type { OwnerProfessionalMembershipResponse } from './entities/owner-professional-membership-response.entity';
import {
  resolveProfessionalCommissionPercent,
  resolveProfessionalProductCommissionPercent,
} from './utils/professional-commission.util';
import { professionalPerformsAllServices } from './utils/professional-service-links.util';
import { professionalPhonesMatch } from './utils/professional-phone-match.util';
import { sortProfessionalsActiveFirst } from './utils/sort-professionals-active-first.util';

export interface FindManagedProfessionalsOptions {
  archived?: boolean;
}

const PROFESSIONAL_WITH_SERVICES_SELECT =
  '*, professional_services(service_id)';

@Injectable()
export class ProfessionalsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly tenantUsersService: TenantUsersService,
  ) {}

  async findActivePerformingAllServices(
    tenantId: string,
    serviceIds: string[],
  ): Promise<Professional[]> {
    if (serviceIds.length === 0) {
      return [];
    }

    const professionals = await this.findAllByTenant(tenantId);

    return professionals.filter((professional) =>
      professionalPerformsAllServices(professional, serviceIds),
    );
  }

  async assertProfessionalPerformsAllServices(
    tenantId: string,
    professionalId: string,
    serviceIds: string[],
  ): Promise<void> {
    const professional = await this.findOneWithServices(
      professionalId,
      tenantId,
    );

    if (!professional.is_active) {
      throw new BadRequestException(
        'O profissional selecionado não está disponível para agendamento.',
      );
    }

    if (!professionalPerformsAllServices(professional, serviceIds)) {
      throw new BadRequestException(
        'O profissional selecionado não realiza todos os serviços escolhidos.',
      );
    }
  }

  async findAllByTenant(tenantId: string): Promise<Professional[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select(PROFESSIONAL_WITH_SERVICES_SELECT)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => this.mapProfessionalRow(row as Professional));
  }

  async findAllManagedByTenant(
    tenantId: string,
    options: FindManagedProfessionalsOptions = {},
  ): Promise<Professional[]> {
    let query = this.supabaseService
      .getClient()
      .from('professionals')
      .select(PROFESSIONAL_WITH_SERVICES_SELECT)
      .eq('tenant_id', tenantId);

    if (options.archived) {
      query = query.not('deleted_at', 'is', null);
    } else {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query
      .order('is_active', { ascending: false })
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return sortProfessionalsActiveFirst(
      (data ?? []).map((row) => this.mapProfessionalRow(row as Professional)),
    );
  }

  async countActiveByTenant(tenantId: string): Promise<number> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return count ?? 0;
  }

  async assertCanCreateProfessional(
    tenantId: string,
    planTier: PlanTier,
    willBeActive: boolean,
  ): Promise<void> {
    if (!willBeActive) {
      return;
    }

    const activeCount = await this.countActiveByTenant(tenantId);

    if (!canAddActiveProfessional(planTier, activeCount)) {
      const message = getProfessionalLimitMessage(planTier);

      throw new ForbiddenException(
        message ?? 'Limite de profissionais atingido para o seu plano.',
      );
    }
  }

  async createForTenant(
    tenantId: string,
    planTier: PlanTier,
    dto: CreateProfessionalDto,
  ): Promise<Professional> {
    const willBeActive = dto.isActive ?? true;
    const contactPhone = this.normalizeContactPhone(dto.contactPhone);
    const inviteEmail = dto.inviteEmail?.trim().toLowerCase() || null;

    await this.assertNoArchivedProfessionalMatch(
      tenantId,
      contactPhone,
      inviteEmail,
    );
    await this.assertCanCreateProfessional(tenantId, planTier, willBeActive);

    const commissionPercent = resolveProfessionalCommissionPercent(
      planTier,
      dto.commissionPercent,
    );
    const productCommissionPercent = resolveProfessionalProductCommissionPercent(
      planTier,
      dto.productCommissionPercent,
    );

    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .insert({
        tenant_id: tenantId,
        name: dto.name.trim(),
        contact_phone: contactPhone,
        avatar_url: dto.avatarUrl?.trim() || null,
        commission_percent: commissionPercent,
        product_commission_percent: productCommissionPercent,
        booking_acceptance_type: this.normalizeProfessionalBookingAcceptanceType(
          dto.bookingAcceptanceType,
        ),
        is_active: dto.isActive ?? true,
        deleted_at: null,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const professional = data as Professional;

    await this.replaceProfessionalServices(
      tenantId,
      professional.id,
      dto.serviceIds ?? [],
    );

    return this.findOneWithServices(professional.id, tenantId);
  }

  async updateForTenant(
    tenantId: string,
    planTier: PlanTier,
    professionalId: string,
    dto: UpdateProfessionalDto,
  ): Promise<Professional> {
    const existing = await this.assertProfessionalBelongsToTenant(
      professionalId,
      tenantId,
    );
    const wasUnavailable =
      existing.is_active === false || Boolean(existing.deleted_at);
    const becomingActive = dto.isActive === true && wasUnavailable;

    if (becomingActive) {
      await this.assertCanCreateProfessional(tenantId, planTier, true);
    }

    const payload: Record<string, string | boolean | number | null> = {};

    if (dto.name !== undefined) {
      payload.name = dto.name.trim();
    }

    if (dto.avatarUrl !== undefined) {
      payload.avatar_url = dto.avatarUrl?.trim() || null;
    }

    if (dto.isActive !== undefined) {
      payload.is_active = dto.isActive;
      if (dto.isActive) {
        payload.deleted_at = null;
      }
    }

    if (dto.contactPhone !== undefined) {
      payload.contact_phone = this.normalizeContactPhone(dto.contactPhone);
    }

    if (dto.commissionPercent !== undefined) {
      payload.commission_percent = resolveProfessionalCommissionPercent(
        planTier,
        dto.commissionPercent,
      );
    }

    if (dto.productCommissionPercent !== undefined) {
      payload.product_commission_percent = resolveProfessionalProductCommissionPercent(
        planTier,
        dto.productCommissionPercent,
      );
    }

    if (dto.bookingAcceptanceType !== undefined) {
      payload.booking_acceptance_type =
        this.normalizeProfessionalBookingAcceptanceType(dto.bookingAcceptanceType);
    }

    if (Object.keys(payload).length > 0) {
      const { error } = await this.supabaseService
        .getClient()
        .from('professionals')
        .update(payload)
        .eq('id', professionalId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }

    if (dto.serviceIds !== undefined) {
      await this.replaceProfessionalServices(
        tenantId,
        professionalId,
        dto.serviceIds,
      );
    }

    return this.findOneWithServices(professionalId, tenantId);
  }

  /** Temporary pause: stays on the main team list as inactive. */
  async deactivateForTenant(
    tenantId: string,
    planTier: PlanTier,
    professionalId: string,
  ): Promise<Professional> {
    return this.updateForTenant(tenantId, planTier, professionalId, {
      isActive: false,
    });
  }

  /** Archive: hidden from the main list; recoverable by match or restore. */
  async archiveForTenant(
    tenantId: string,
    professionalId: string,
  ): Promise<Professional> {
    await this.assertProfessionalBelongsToTenant(professionalId, tenantId);

    const { error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', professionalId)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    await this.tenantUsersService.revokeAccessForArchivedProfessional(
      tenantId,
      professionalId,
    );

    return this.findOneWithServices(professionalId, tenantId);
  }

  /** @deprecated Use deactivateForTenant or archiveForTenant. */
  async softDeleteForTenant(
    tenantId: string,
    planTier: PlanTier,
    professionalId: string,
  ): Promise<Professional> {
    return this.deactivateForTenant(tenantId, planTier, professionalId);
  }

  async findArchivedMatch(
    tenantId: string,
    contactPhone?: string | null,
    inviteEmail?: string | null,
  ): Promise<Professional | null> {
    const archived = await this.findAllManagedByTenant(tenantId, {
      archived: true,
    });

    if (archived.length === 0) {
      return null;
    }

    const phoneMatch = archived.find((professional) =>
      professionalPhonesMatch(professional.contact_phone, contactPhone),
    );

    if (phoneMatch) {
      return phoneMatch;
    }

    const normalizedEmail = inviteEmail?.trim().toLowerCase();
    if (!normalizedEmail) {
      return null;
    }

    const archivedIds = archived.map((item) => item.id);
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_user_invites')
      .select('professional_id')
      .eq('tenant_id', tenantId)
      .eq('email', normalizedEmail)
      .in('professional_id', archivedIds)
      .limit(1);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const matchedId = data?.[0]?.professional_id as string | undefined;
    if (!matchedId) {
      return null;
    }

    return archived.find((item) => item.id === matchedId) ?? null;
  }

  private async assertNoArchivedProfessionalMatch(
    tenantId: string,
    contactPhone: string | null,
    inviteEmail: string | null,
  ): Promise<void> {
    const match = await this.findArchivedMatch(
      tenantId,
      contactPhone,
      inviteEmail,
    );

    if (!match) {
      return;
    }

    const body: ArchivedProfessionalMatchResponse = {
      code: ARCHIVED_PROFESSIONAL_MATCH_CODE,
      message:
        'Já existe um profissional excluído com este celular ou e-mail. Reative o cadastro em vez de criar outro.',
      professionalId: match.id,
      name: match.name,
      contactPhone: match.contact_phone,
    };

    throw new ConflictException(body);
  }

  private async replaceProfessionalServices(
    tenantId: string,
    professionalId: string,
    serviceIds: string[],
  ): Promise<void> {
    const { error: deleteError } = await this.supabaseService
      .getClient()
      .from('professional_services')
      .delete()
      .eq('professional_id', professionalId)
      .eq('tenant_id', tenantId);

    if (deleteError) {
      throw new InternalServerErrorException(deleteError.message);
    }

    const uniqueServiceIds = [...new Set(serviceIds.filter(Boolean))];

    if (uniqueServiceIds.length === 0) {
      return;
    }

    const rows = uniqueServiceIds.map((serviceId) => ({
      professional_id: professionalId,
      service_id: serviceId,
      tenant_id: tenantId,
    }));

    const { error: insertError } = await this.supabaseService
      .getClient()
      .from('professional_services')
      .insert(rows);

    if (insertError) {
      throw new InternalServerErrorException(insertError.message);
    }
  }

  async findOneWithServices(
    professionalId: string,
    tenantId: string,
  ): Promise<Professional> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select(PROFESSIONAL_WITH_SERVICES_SELECT)
      .eq('id', professionalId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapProfessionalRow(data as Professional);
  }

  async assertProfessionalBelongsToTenant(
    professionalId: string,
    tenantId: string,
  ): Promise<Professional> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select('*')
      .eq('id', professionalId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException(
        `Professional with id "${professionalId}" was not found for this tenant`,
      );
    }

    return this.mapProfessionalRow(data as Professional);
  }

  async registerOwnerAsProfessional(
    accessContext: TenantAccessContext,
    dto: CreateProfessionalDto,
  ): Promise<OwnerProfessionalMembershipResponse> {
    this.assertOwnerCanLinkProfessional(accessContext);

    if (!dto.name?.trim()) {
      throw new BadRequestException('Field "name" is required');
    }

    const professional = await this.createForTenant(
      accessContext.tenant.id,
      accessContext.tenant.plan_tier,
      dto,
    );

    const updatedMembership =
      await this.tenantUsersService.linkOwnerProfessionalMembership(
        accessContext.tenant.id,
        accessContext.tenantUser.user_id,
        professional.id,
      );

    return {
      professional,
      membership: this.tenantUsersService.mapMembershipSummary(updatedMembership),
    };
  }

  async linkOwnerToExistingProfessional(
    accessContext: TenantAccessContext,
    professionalId: string,
  ): Promise<OwnerProfessionalMembershipResponse> {
    this.assertOwnerCanLinkProfessional(accessContext);

    const trimmedProfessionalId = professionalId.trim();

    if (!trimmedProfessionalId) {
      throw new BadRequestException('Field "professionalId" is required');
    }

    await this.assertProfessionalBelongsToTenant(
      trimmedProfessionalId,
      accessContext.tenant.id,
    );

    const professional = await this.findOneWithServices(
      trimmedProfessionalId,
      accessContext.tenant.id,
    );

    if (professional.deleted_at || !professional.is_active) {
      throw new BadRequestException(
        'Só é possível vincular a um profissional ativo.',
      );
    }

    const updatedMembership =
      await this.tenantUsersService.linkOwnerProfessionalMembership(
        accessContext.tenant.id,
        accessContext.tenantUser.user_id,
        professional.id,
      );

    return {
      professional,
      membership: this.tenantUsersService.mapMembershipSummary(updatedMembership),
    };
  }

  private assertOwnerCanLinkProfessional(
    accessContext: TenantAccessContext,
  ): void {
    if (accessContext.tenantUser.role !== 'OWNER') {
      throw new ForbiddenException(
        'Somente o dono pode se cadastrar como profissional.',
      );
    }

    if (accessContext.tenantUser.professional_id) {
      throw new BadRequestException(
        'Você já está cadastrado como profissional.',
      );
    }
  }

  private mapProfessionalRow(row: Professional): Professional {
    return {
      ...row,
      is_active: Boolean(row.is_active),
      commission_percent: Number(row.commission_percent ?? 0),
      product_commission_percent:
        row.product_commission_percent === null ||
        row.product_commission_percent === undefined
          ? null
          : Number(row.product_commission_percent),
      deleted_at: row.deleted_at ?? null,
      booking_acceptance_type: this.normalizeProfessionalBookingAcceptanceType(
        row.booking_acceptance_type,
      ),
    };
  }

  private normalizeProfessionalBookingAcceptanceType(
    value: ProfessionalBookingAcceptanceType | null | undefined,
  ): ProfessionalBookingAcceptanceType {
    if (value === 'AUTOMATIC' || value === 'MANUAL') {
      return value;
    }

    return 'DEFAULT';
  }

  private normalizeContactPhone(phone?: string | null): string | null {
    if (phone === undefined || phone === null) {
      return null;
    }

    const trimmed = phone.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
