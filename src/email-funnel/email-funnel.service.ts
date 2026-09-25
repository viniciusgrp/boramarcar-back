import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MailService } from '../mail/mail.service';
import { SupabaseService } from '../supabase/supabase.service';
import { isTrialActive } from '../tenants/utils/tenant-access.util';
import {
  resolveEmailFunnelEligibility,
  shouldRecordSkip,
} from './email-funnel-eligibility.util';
import { buildEmailFunnelHtml } from './email-funnel-html.util';
import { isEmailFunnelStepDue } from './email-funnel-schedule.util';
import type { UpdateEmailFunnelStepDto } from './dto/email-funnel.dto';
import type {
  EmailFunnelSendListItem,
  EmailFunnelSkipReason,
  EmailFunnelStepRow,
  EmailFunnelTriggerType,
} from './email-funnel.types';

interface FunnelTenantRow {
  id: string;
  name: string;
  owner_id: string | null;
  subscription_status: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
  trial_email_funnel_opted_out_at: string | null;
  trial_email_funnel_opt_out_token: string;
}

@Injectable()
export class EmailFunnelService {
  private readonly logger = new Logger(EmailFunnelService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async listSteps(): Promise<EmailFunnelStepRow[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('email_funnel_steps')
      .select('*')
      .order('step_number', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => this.mapStep(row));
  }

  async updateStep(
    stepKey: string,
    dto: UpdateEmailFunnelStepDto,
  ): Promise<EmailFunnelStepRow> {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('email_funnel_steps')
      .update(patch)
      .eq('step_key', stepKey)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Passo do funil não encontrado.');
    }

    return this.mapStep(data);
  }

  async sendWelcomeForNewTenant(params: {
    tenantId: string;
    ownerEmail: string;
  }): Promise<void> {
    await this.processTenantStep('welcome', params.tenantId, params.ownerEmail);
  }

  async processDueEmails(now: Date = new Date()): Promise<number> {
    const steps = (await this.listSteps()).filter((step) => step.is_active);
    const tenants = await this.listCandidateTenants();
    let processed = 0;

    for (const tenant of tenants) {
      const ownerEmail = await this.resolveOwnerEmail(tenant.owner_id);
      const setup = await this.resolveSetupFlags(tenant.id);

      for (const step of steps) {
        const result = await this.processLoadedTenantStep({
          step,
          tenant,
          ownerEmail,
          hasService: setup.hasService,
          hasBusinessHours: setup.hasBusinessHours,
          now,
        });
        if (result === 'sent' || result === 'skipped' || result === 'failed') {
          processed += 1;
        }
      }
    }

    return processed;
  }

  async sendPreview(params: {
    stepKey: string;
    to: string;
  }): Promise<{ sentTo: string }> {
    const step = await this.getStep(params.stepKey);
    const to = params.to.trim().toLowerCase();

    if (!to) {
      throw new BadRequestException('Informe um e-mail de destino.');
    }

    const html = this.renderStep(step, {
      token: 'preview',
      trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      useSetupCopy: false,
    });

    await this.mailService.sendHtmlEmail({
      to,
      subject: `[Teste] ${step.subject}`,
      html,
      failIfUnconfigured: true,
    });

    return { sentTo: to };
  }

  async optOutByToken(token: string): Promise<boolean> {
    const trimmed = token.trim();
    if (!trimmed) {
      return false;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update({ trial_email_funnel_opted_out_at: new Date().toISOString() })
      .eq('trial_email_funnel_opt_out_token', trimmed)
      .is('trial_email_funnel_opted_out_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return Boolean(data);
  }

  private async processTenantStep(
    stepKey: string,
    tenantId: string,
    ownerEmail: string | null,
  ): Promise<'sent' | 'skipped' | 'failed' | 'ignored'> {
    const step = await this.getStep(stepKey);
    const tenant = await this.getFunnelTenant(tenantId);

    if (!tenant) {
      return 'ignored';
    }

    const setup = await this.resolveSetupFlags(tenantId);
    return this.processLoadedTenantStep({
      step,
      tenant,
      ownerEmail,
      hasService: setup.hasService,
      hasBusinessHours: setup.hasBusinessHours,
      now: new Date(),
    });
  }

  private async processLoadedTenantStep(params: {
    step: EmailFunnelStepRow;
    tenant: FunnelTenantRow;
    ownerEmail: string | null;
    hasService: boolean;
    hasBusinessHours: boolean;
    now: Date;
  }): Promise<'sent' | 'skipped' | 'failed' | 'ignored'> {
    const already = await this.hasSendRecord(
      params.tenant.id,
      params.step.step_key,
    );
    const signupAt = new Date(
      params.tenant.trial_starts_at ?? params.tenant.created_at,
    );
    const trialEndsAt = params.tenant.trial_ends_at
      ? new Date(params.tenant.trial_ends_at)
      : null;
    const isDue = isEmailFunnelStepDue({
      now: params.now,
      signupAt,
      trialEndsAt,
      triggerType: params.step.trigger_type,
      triggerOffset: params.step.trigger_offset,
      sendHour: params.step.send_hour,
      windowStartHour: params.step.window_start_hour,
      windowEndHour: params.step.window_end_hour,
    });

    const eligibility = resolveEmailFunnelEligibility({
      isActive: params.step.is_active,
      optedOut: Boolean(params.tenant.trial_email_funnel_opted_out_at),
      subscriptionStatus: params.tenant.subscription_status,
      trialEnded: !isTrialActive({
        trial_ends_at: params.tenant.trial_ends_at,
      }, params.now),
      skipIfSetupComplete: params.step.skip_if_setup_complete,
      hasService: params.hasService,
      hasBusinessHours: params.hasBusinessHours,
      alreadyProcessed: already,
      isDue,
      hasRecipientEmail: Boolean(params.ownerEmail?.trim()),
    });

    if (eligibility === 'already_processed' || eligibility === 'not_due') {
      return 'ignored';
    }

    if (eligibility === 'inactive_step') {
      return 'ignored';
    }

    if (shouldRecordSkip(eligibility)) {
      await this.recordSend({
        tenantId: params.tenant.id,
        stepKey: params.step.step_key,
        status: 'skipped',
        skippedReason: eligibility,
        errorMessage: null,
        recipientEmail: params.ownerEmail,
      });
      return 'skipped';
    }

    if (eligibility !== 'send' || !params.ownerEmail) {
      return 'ignored';
    }

    const delivered = await this.deliverStepEmail({
      step: params.step,
      tenant: params.tenant,
      recipientEmail: params.ownerEmail,
      useSetupCopy: params.hasService && params.hasBusinessHours,
    });

    await this.recordSend({
      tenantId: params.tenant.id,
      stepKey: params.step.step_key,
      status: delivered.ok ? 'sent' : 'failed',
      skippedReason: null,
      errorMessage: delivered.ok ? null : delivered.error,
      recipientEmail: params.ownerEmail,
    });

    return delivered.ok ? 'sent' : 'failed';
  }

  async listSends(): Promise<EmailFunnelSendListItem[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('email_funnel_sends')
      .select(
        'id, tenant_id, step_key, status, skipped_reason, error_message, recipient_email, sent_at, tenants(name), email_funnel_steps(subject, step_number)',
      )
      .order('sent_at', { ascending: false })
      .limit(300);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => this.mapSendListItem(row));
  }

  async resend(sendId: string): Promise<EmailFunnelSendListItem> {
    const existing = await this.getSendRow(sendId);
    const tenant = await this.getFunnelTenant(existing.tenant_id);
    const step = await this.getStep(existing.step_key);

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    const recipient =
      existing.recipient_email?.trim() ||
      (await this.resolveOwnerEmail(tenant.owner_id));

    if (!recipient) {
      await this.recordSend({
        tenantId: tenant.id,
        stepKey: step.step_key,
        status: 'failed',
        skippedReason: null,
        errorMessage: 'Estabelecimento sem e-mail do responsável.',
        recipientEmail: null,
      });
      return this.getSendListItem(tenant.id, step.step_key);
    }

    const setup = await this.resolveSetupFlags(tenant.id);
    const delivered = await this.deliverStepEmail({
      step,
      tenant,
      recipientEmail: recipient,
      useSetupCopy: setup.hasService && setup.hasBusinessHours,
    });

    await this.recordSend({
      tenantId: tenant.id,
      stepKey: step.step_key,
      status: delivered.ok ? 'sent' : 'failed',
      skippedReason: null,
      errorMessage: delivered.ok ? null : delivered.error,
      recipientEmail: recipient,
    });

    return this.getSendListItem(tenant.id, step.step_key);
  }

  private renderStep(
    step: EmailFunnelStepRow,
    params: {
      token: string;
      trialEndsAt: string | null;
      useSetupCopy: boolean;
    },
  ): string {
    const frontendUrl = (
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
    const ctaPath = step.cta_path.trim() || '/admin/login';
    const ctaUrl = `${frontendUrl}${ctaPath.startsWith('/') ? ctaPath : `/${ctaPath}`}`;
    const optOutUrl = `${frontendUrl}/descadastrar-emails-trial?token=${encodeURIComponent(params.token)}`;
    const trialEndsLabel =
      step.step_key === 'trial_ending' && params.trialEndsAt
        ? format(new Date(params.trialEndsAt), "d 'de' MMMM 'de' yyyy", {
            locale: ptBR,
          })
        : null;

    return buildEmailFunnelHtml({
      step,
      frontendUrl,
      ctaUrl,
      optOutUrl,
      useSetupCopy: params.useSetupCopy,
      trialEndsLabel,
    });
  }

  private async getStep(stepKey: string): Promise<EmailFunnelStepRow> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('email_funnel_steps')
      .select('*')
      .eq('step_key', stepKey)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Passo do funil não encontrado.');
    }

    return this.mapStep(data);
  }

  private async getFunnelTenant(
    tenantId: string,
  ): Promise<FunnelTenantRow | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select(
        'id, name, owner_id, subscription_status, trial_starts_at, trial_ends_at, created_at, trial_email_funnel_opted_out_at, trial_email_funnel_opt_out_token',
      )
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as FunnelTenantRow | null;
  }

  private async listCandidateTenants(): Promise<FunnelTenantRow[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select(
        'id, name, owner_id, subscription_status, trial_starts_at, trial_ends_at, created_at, trial_email_funnel_opted_out_at, trial_email_funnel_opt_out_token',
      )
      .neq('subscription_status', 'ACTIVE')
      .is('trial_email_funnel_opted_out_at', null);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as FunnelTenantRow[];
  }

  private async resolveSetupFlags(tenantId: string): Promise<{
    hasService: boolean;
    hasBusinessHours: boolean;
  }> {
    const client = this.supabaseService.getClient();
    const [services, hours] = await Promise.all([
      client
        .from('services')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      client
        .from('business_hours')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_closed', false),
    ]);

    if (services.error) {
      throw new InternalServerErrorException(services.error.message);
    }
    if (hours.error) {
      throw new InternalServerErrorException(hours.error.message);
    }

    return {
      hasService: (services.count ?? 0) > 0,
      hasBusinessHours: (hours.count ?? 0) > 0,
    };
  }

  private async resolveOwnerEmail(
    ownerId: string | null,
  ): Promise<string | null> {
    if (!ownerId) {
      return null;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .auth.admin.getUserById(ownerId);

    if (error) {
      this.logger.warn(`Could not resolve owner email for ${ownerId}`);
      return null;
    }

    return data.user?.email?.trim().toLowerCase() ?? null;
  }

  private async hasSendRecord(
    tenantId: string,
    stepKey: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('email_funnel_sends')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('step_key', stepKey)
      .in('status', ['sent', 'skipped'])
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return Boolean(data);
  }

  private async deliverStepEmail(params: {
    step: EmailFunnelStepRow;
    tenant: FunnelTenantRow;
    recipientEmail: string;
    useSetupCopy: boolean;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const html = this.renderStep(params.step, {
      token: params.tenant.trial_email_funnel_opt_out_token,
      trialEndsAt: params.tenant.trial_ends_at,
      useSetupCopy: params.useSetupCopy,
    });

    try {
      await this.mailService.sendHtmlEmail({
        to: params.recipientEmail,
        subject: params.step.subject,
        html,
        failIfUnconfigured: true,
      });
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao enviar o e-mail.';
      this.logger.warn(
        `Email funnel send failed for tenant ${params.tenant.id} step ${params.step.step_key}: ${message}`,
      );
      return { ok: false, error: message };
    }
  }

  private async recordSend(params: {
    tenantId: string;
    stepKey: string;
    status: 'sent' | 'skipped' | 'failed';
    skippedReason: EmailFunnelSkipReason | null;
    errorMessage: string | null;
    recipientEmail: string | null;
  }): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('email_funnel_sends')
      .upsert(
        {
          tenant_id: params.tenantId,
          step_key: params.stepKey,
          status: params.status,
          skipped_reason: params.skippedReason,
          error_message: params.errorMessage,
          recipient_email: params.recipientEmail,
          sent_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,step_key' },
      );

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async getSendRow(sendId: string): Promise<{
    tenant_id: string;
    step_key: string;
    recipient_email: string | null;
  }> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('email_funnel_sends')
      .select('tenant_id, step_key, recipient_email')
      .eq('id', sendId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Envio não encontrado.');
    }

    return data as {
      tenant_id: string;
      step_key: string;
      recipient_email: string | null;
    };
  }

  private async getSendListItem(
    tenantId: string,
    stepKey: string,
  ): Promise<EmailFunnelSendListItem> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('email_funnel_sends')
      .select(
        'id, tenant_id, step_key, status, skipped_reason, error_message, recipient_email, sent_at, tenants(name), email_funnel_steps(subject, step_number)',
      )
      .eq('tenant_id', tenantId)
      .eq('step_key', stepKey)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Envio não encontrado.');
    }

    return this.mapSendListItem(data);
  }

  private mapSendListItem(row: Record<string, unknown>): EmailFunnelSendListItem {
    const tenant = firstRelation(row.tenants);
    const step = firstRelation(row.email_funnel_steps);

    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      tenantName: typeof tenant?.name === 'string' ? tenant.name : 'Estabelecimento',
      recipientEmail:
        typeof row.recipient_email === 'string' ? row.recipient_email : null,
      stepKey: String(row.step_key),
      stepNumber:
        typeof step?.step_number === 'number' ? step.step_number : null,
      subject: typeof step?.subject === 'string' ? step.subject : String(row.step_key),
      status: row.status === 'failed' || row.status === 'skipped' ? row.status : 'sent',
      skippedReason:
        typeof row.skipped_reason === 'string' ? row.skipped_reason : null,
      errorMessage:
        typeof row.error_message === 'string' ? row.error_message : null,
      sentAt: String(row.sent_at ?? ''),
    };
  }

  private mapStep(row: Record<string, unknown>): EmailFunnelStepRow {
    return {
      step_key: String(row.step_key),
      step_number: Number(row.step_number),
      subject: String(row.subject ?? ''),
      title: String(row.title ?? ''),
      body_text: String(row.body_text ?? ''),
      body_if_setup:
        typeof row.body_if_setup === 'string' ? row.body_if_setup : null,
      steps_json: Array.isArray(row.steps_json)
        ? (row.steps_json as EmailFunnelStepRow['steps_json'])
        : null,
      cta_label: String(row.cta_label ?? ''),
      cta_path: String(row.cta_path ?? ''),
      trigger_type: row.trigger_type as EmailFunnelTriggerType,
      trigger_offset: Number(row.trigger_offset ?? 0),
      send_hour:
        row.send_hour === null || row.send_hour === undefined
          ? null
          : Number(row.send_hour),
      window_start_hour:
        row.window_start_hour === null || row.window_start_hour === undefined
          ? null
          : Number(row.window_start_hour),
      window_end_hour:
        row.window_end_hour === null || row.window_end_hour === undefined
          ? null
          : Number(row.window_end_hour),
      skip_if_setup_complete: Boolean(row.skip_if_setup_complete),
      is_active: Boolean(row.is_active),
      image_url: typeof row.image_url === 'string' ? row.image_url : null,
      video_url: typeof row.video_url === 'string' ? row.video_url : null,
      updated_at: String(row.updated_at ?? ''),
    };
  }
}

function firstRelation(
  value: unknown,
): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object'
      ? (first as Record<string, unknown>)
      : null;
  }

  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return null;
}
