import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  AFFILIATE_DEFAULT_COMMISSION_PERCENT,
  AFFILIATE_PAYOUT_MINIMUM_CENTS,
  AFFILIATE_TERMS_VERSION,
} from './affiliate.constants';
import type { RegisterAffiliateDto, UpdateAffiliateMeDto } from './dto/affiliate.dto';
import type {
  Affiliate,
  AffiliateCommissionItem,
  AffiliatePayout,
  AffiliatePixKeyType,
  AffiliateStatus,
} from './entities/affiliate.entity';
import {
  generateAffiliateCode,
  isSelfReferral,
  normalizeAffiliateCode,
} from './utils/affiliate-code.util';
import {
  buildReversalInvoiceId,
  canIncludeInPayout,
  roundCommissionCents,
  shouldSkipUnpaidOrTrialInvoice,
} from './utils/affiliate-commission.util';

export interface AffiliateAttribution {
  affiliateId: string;
  attributedAt: string;
}

export interface AccruePaidPlanInvoiceParams {
  stripeInvoiceId: string;
  stripeCustomerId: string;
  amountPaid: number;
  planGrossCents: number;
  paidAtIso: string;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function mapAffiliate(row: Affiliate): Affiliate {
  return {
    ...row,
    commission_percent: Number(row.commission_percent),
    cnpj: row.cnpj ?? null,
    phone: row.phone ?? null,
    notes: row.notes ?? null,
    terms_ip: row.terms_ip ?? null,
    terms_user_agent: row.terms_user_agent ?? null,
  };
}

function toPublicAffiliate(affiliate: Affiliate) {
  return {
    id: affiliate.id,
    code: affiliate.code,
    status: affiliate.status,
    full_name: affiliate.full_name,
    email: affiliate.email,
    cpf: affiliate.cpf,
    cnpj: affiliate.cnpj,
    phone: affiliate.phone,
    pix_key: affiliate.pix_key,
    pix_key_type: affiliate.pix_key_type,
    commission_percent: Number(affiliate.commission_percent),
    terms_version: affiliate.terms_version,
    terms_accepted_at: affiliate.terms_accepted_at,
    created_at: affiliate.created_at,
  };
}

@Injectable()
export class AffiliatesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  toPublicAffiliate(affiliate: Affiliate) {
    return toPublicAffiliate(affiliate);
  }

  async findByAuthUserId(userId: string): Promise<Affiliate | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('affiliates')
      .select('*')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapAffiliate(data as Affiliate) : null;
  }

  async findByCode(code: string): Promise<Affiliate | null> {
    const normalized = normalizeAffiliateCode(code);
    if (!normalized) {
      return null;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('affiliates')
      .select('*')
      .eq('code', normalized)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapAffiliate(data as Affiliate) : null;
  }

  async resolveAttributionForSignup(params: {
    affiliateCode?: string | null;
    signupEmail?: string | null;
    signupUserId?: string | null;
  }): Promise<AffiliateAttribution | null> {
    const code = normalizeAffiliateCode(params.affiliateCode);
    if (!code) {
      return null;
    }

    const affiliate = await this.findByCode(code);
    if (!affiliate || affiliate.status !== 'active') {
      return null;
    }

    if (
      isSelfReferral({
        affiliateEmail: affiliate.email,
        affiliateCpf: affiliate.cpf,
        affiliateAuthUserId: affiliate.auth_user_id,
        signupEmail: params.signupEmail,
        signupUserId: params.signupUserId,
      })
    ) {
      return null;
    }

    return {
      affiliateId: affiliate.id,
      attributedAt: new Date().toISOString(),
    };
  }

  async register(
    dto: RegisterAffiliateDto,
    meta: { ip: string | null; userAgent: string | null },
  ) {
    if (dto.terms_version.trim() !== AFFILIATE_TERMS_VERSION) {
      throw new BadRequestException(
        'Atualize a página e aceite a versão vigente dos termos do programa.',
      );
    }

    const fullName = dto.full_name.trim();
    const email = dto.email.trim().toLowerCase();
    const cpf = digitsOnly(dto.cpf);
    const cnpj = dto.cnpj ? digitsOnly(dto.cnpj) : '';
    const pixKey = dto.pix_key.trim();

    if (cpf.length !== 11) {
      throw new BadRequestException('Informe um CPF válido.');
    }

    if (cnpj && cnpj.length !== 14) {
      throw new BadRequestException('Informe um CNPJ válido ou deixe em branco.');
    }

    const { data: authData, error: authError } = await this.supabaseService
      .getClient()
      .auth.admin.createUser({
        email,
        password: dto.password,
        email_confirm: true,
        user_metadata: { full_name: fullName, account_kind: 'affiliate' },
      });

    if (authError || !authData.user) {
      const message = authError?.message?.toLowerCase() ?? '';
      if (message.includes('already') || message.includes('registered')) {
        throw new ConflictException('Este e-mail já está cadastrado.');
      }
      throw new BadRequestException(
        authError?.message ?? 'Não foi possível criar a conta do parceiro.',
      );
    }

    const ownerId = authData.user.id;
    const code = await this.allocateUniqueCode();
    const now = new Date().toISOString();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('affiliates')
      .insert({
        auth_user_id: ownerId,
        code,
        status: 'pending_review' satisfies AffiliateStatus,
        full_name: fullName,
        email,
        cpf,
        cnpj: cnpj || null,
        phone: dto.phone?.trim() || null,
        pix_key: pixKey,
        pix_key_type: dto.pix_key_type,
        commission_percent: AFFILIATE_DEFAULT_COMMISSION_PERCENT,
        terms_version: AFFILIATE_TERMS_VERSION,
        terms_accepted_at: now,
        terms_ip: meta.ip,
        terms_user_agent: meta.userAgent,
        ack_independent_partnership: true,
        ack_autonomy: true,
        ack_result_only_pay: true,
        ack_own_taxes: true,
        ack_no_employment: true,
      })
      .select('*')
      .single();

    if (error || !data) {
      await this.supabaseService.getClient().auth.admin.deleteUser(ownerId);
      if (error?.code === '23505') {
        throw new ConflictException('Este e-mail já está cadastrado como parceiro.');
      }
      throw new InternalServerErrorException(
        error?.message ?? 'Não foi possível concluir o cadastro de parceiro.',
      );
    }

    return toPublicAffiliate(mapAffiliate(data as Affiliate));
  }

  async updateMe(affiliateId: string, dto: UpdateAffiliateMeDto) {
    const patch: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.full_name?.trim()) {
      patch.full_name = dto.full_name.trim();
    }
    if (dto.phone !== undefined) {
      patch.phone = dto.phone.trim() || null;
    }
    if (dto.cnpj !== undefined) {
      const cnpj = digitsOnly(dto.cnpj);
      if (cnpj && cnpj.length !== 14) {
        throw new BadRequestException('Informe um CNPJ válido ou deixe em branco.');
      }
      patch.cnpj = cnpj || null;
    }
    if (dto.pix_key?.trim()) {
      patch.pix_key = dto.pix_key.trim();
    }
    if (dto.pix_key_type) {
      patch.pix_key_type = dto.pix_key_type;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('affiliates')
      .update(patch)
      .eq('id', affiliateId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Não foi possível atualizar os dados.',
      );
    }

    return toPublicAffiliate(mapAffiliate(data as Affiliate));
  }

  async trackClick(code: string, landingPath: string): Promise<void> {
    const affiliate = await this.findByCode(code);
    if (!affiliate || affiliate.status !== 'active') {
      return;
    }

    const path = landingPath.trim() || '/';
    const { error } = await this.supabaseService
      .getClient()
      .from('affiliate_clicks')
      .insert({
        affiliate_id: affiliate.id,
        landing_path: path.slice(0, 200),
      });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async getStats(affiliateId: string) {
    const client = this.supabaseService.getClient();

    const [clicksRes, tenantsRes, commissionsRes, payoutsRes] = await Promise.all([
      client
        .from('affiliate_clicks')
        .select('id', { count: 'exact', head: true })
        .eq('affiliate_id', affiliateId),
      client
        .from('tenants')
        .select('id, subscription_status')
        .eq('referred_by_affiliate_id', affiliateId),
      client
        .from('affiliate_commission_items')
        .select('status, commission_amount_cents, payout_id, gross_amount_cents')
        .eq('affiliate_id', affiliateId),
      client
        .from('affiliate_payouts')
        .select('amount_cents, status')
        .eq('affiliate_id', affiliateId),
    ]);

    if (clicksRes.error) {
      throw new InternalServerErrorException(clicksRes.error.message);
    }
    if (tenantsRes.error) {
      throw new InternalServerErrorException(tenantsRes.error.message);
    }
    if (commissionsRes.error) {
      throw new InternalServerErrorException(commissionsRes.error.message);
    }
    if (payoutsRes.error) {
      throw new InternalServerErrorException(payoutsRes.error.message);
    }

    const tenants = (tenantsRes.data ?? []) as Array<{
      id: string;
      subscription_status: string;
    }>;
    const commissions = (commissionsRes.data ?? []) as Array<{
      status: string;
      commission_amount_cents: number;
      payout_id: string | null;
      gross_amount_cents: number;
    }>;
    const payouts = (payoutsRes.data ?? []) as Array<{
      amount_cents: number;
      status: string;
    }>;

    const accrued = commissions.filter((item) => item.status === 'accrued');
    const availableCents = accrued
      .filter((item) => !item.payout_id)
      .reduce((sum, item) => sum + Number(item.commission_amount_cents), 0);
    const paidCents = payouts
      .filter((item) => item.status === 'paid')
      .reduce((sum, item) => sum + Number(item.amount_cents), 0);
    const attributedMrrCents = accrued.reduce(
      (sum, item) => sum + Number(item.gross_amount_cents),
      0,
    );

    return {
      clicks: clicksRes.count ?? 0,
      signups: tenants.length,
      active_subscriptions: tenants.filter(
        (tenant) => tenant.subscription_status === 'ACTIVE',
      ).length,
      attributed_paid_gross_cents: attributedMrrCents,
      available_cents: availableCents,
      paid_cents: paidCents,
      payout_minimum_cents: AFFILIATE_PAYOUT_MINIMUM_CENTS,
    };
  }

  async listReferrals(affiliateId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select(
        'id, name, slug, subscription_status, plan_tier, affiliate_attributed_at, created_at',
      )
      .eq('referred_by_affiliate_id', affiliateId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      subscription_status: row.subscription_status as string,
      plan_tier: row.plan_tier as string,
      affiliate_attributed_at: row.affiliate_attributed_at as string | null,
      created_at: row.created_at as string,
    }));
  }

  async listCommissions(affiliateId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('affiliate_commission_items')
      .select('*')
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as AffiliateCommissionItem[];
  }

  async listPayouts(affiliateId: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('affiliate_payouts')
      .select('*')
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as AffiliatePayout[];
  }

  async accruePaidPlanInvoice(
    params: AccruePaidPlanInvoiceParams,
  ): Promise<AffiliateCommissionItem | null> {
    if (
      shouldSkipUnpaidOrTrialInvoice({
        amountPaid: params.amountPaid,
        planGrossCents: params.planGrossCents,
      })
    ) {
      return null;
    }

    const { data: tenant, error: tenantError } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('id, referred_by_affiliate_id')
      .eq('stripe_customer_id', params.stripeCustomerId)
      .maybeSingle();

    if (tenantError) {
      throw new InternalServerErrorException(tenantError.message);
    }

    const affiliateId = tenant?.referred_by_affiliate_id as string | null | undefined;
    if (!tenant?.id || !affiliateId) {
      return null;
    }

    const { data: affiliateRow, error: affiliateError } = await this.supabaseService
      .getClient()
      .from('affiliates')
      .select('*')
      .eq('id', affiliateId)
      .maybeSingle();

    if (affiliateError) {
      throw new InternalServerErrorException(affiliateError.message);
    }

    const affiliate = affiliateRow ? mapAffiliate(affiliateRow as Affiliate) : null;
    if (!affiliate || affiliate.status !== 'active') {
      return null;
    }

    const commissionAmountCents = roundCommissionCents(
      params.planGrossCents,
      Number(affiliate.commission_percent),
    );

    if (commissionAmountCents <= 0) {
      return null;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('affiliate_commission_items')
      .insert({
        affiliate_id: affiliate.id,
        tenant_id: tenant.id,
        stripe_invoice_id: params.stripeInvoiceId,
        invoice_paid_at: params.paidAtIso,
        gross_amount_cents: params.planGrossCents,
        commission_amount_cents: commissionAmountCents,
        status: 'accrued',
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return null;
      }
      throw new InternalServerErrorException(error.message);
    }

    return data as AffiliateCommissionItem;
  }

  async reverseInvoice(stripeInvoiceId: string, reason: string): Promise<void> {
    const { data: existing, error } = await this.supabaseService
      .getClient()
      .from('affiliate_commission_items')
      .select('*')
      .eq('stripe_invoice_id', stripeInvoiceId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const item = existing as AffiliateCommissionItem | null;
    if (!item || item.status === 'reversed') {
      return;
    }

    if (!item.payout_id) {
      const { error: updateError } = await this.supabaseService
        .getClient()
        .from('affiliate_commission_items')
        .update({
          status: 'reversed',
          reversal_reason: reason,
        })
        .eq('id', item.id);

      if (updateError) {
        throw new InternalServerErrorException(updateError.message);
      }
      return;
    }

    const { error: insertError } = await this.supabaseService
      .getClient()
      .from('affiliate_commission_items')
      .insert({
        affiliate_id: item.affiliate_id,
        tenant_id: item.tenant_id,
        stripe_invoice_id: buildReversalInvoiceId(stripeInvoiceId),
        invoice_paid_at: new Date().toISOString(),
        gross_amount_cents: -Math.abs(Number(item.gross_amount_cents)),
        commission_amount_cents: -Math.abs(Number(item.commission_amount_cents)),
        status: 'accrued',
        reversal_reason: reason,
      });

    if (insertError && insertError.code !== '23505') {
      throw new InternalServerErrorException(insertError.message);
    }
  }

  async listForPlatform(params: { status?: string; search?: string }) {
    let query = this.supabaseService
      .getClient()
      .from('affiliates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (params.status) {
      query = query.eq('status', params.status);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const search = params.search?.trim().toLowerCase();
    const rows = ((data ?? []) as Affiliate[]).map(mapAffiliate);

    if (!search) {
      return rows;
    }

    return rows.filter(
      (row) =>
        row.full_name.toLowerCase().includes(search) ||
        row.email.toLowerCase().includes(search) ||
        row.code.toLowerCase().includes(search) ||
        row.cpf.includes(digitsOnly(search)),
    );
  }

  async getPlatformDetail(affiliateId: string) {
    const affiliate = await this.findById(affiliateId);
    if (!affiliate) {
      throw new NotFoundException('Parceiro não encontrado.');
    }

    const [stats, referrals, commissions, payouts] = await Promise.all([
      this.getStats(affiliateId),
      this.listReferrals(affiliateId),
      this.listCommissions(affiliateId),
      this.listPayouts(affiliateId),
    ]);

    return { affiliate, stats, referrals, commissions, payouts };
  }

  async updateStatus(
    affiliateId: string,
    status: AffiliateStatus,
    notes?: string,
  ) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('affiliates')
      .update({
        status,
        notes: notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', affiliateId)
      .select('*')
      .single();

    if (error || !data) {
      throw new NotFoundException('Parceiro não encontrado.');
    }

    return mapAffiliate(data as Affiliate);
  }

  async generateMonthlyPayouts(periodYear: number, periodMonth: number) {
    const { data: affiliates, error: affiliatesError } = await this.supabaseService
      .getClient()
      .from('affiliates')
      .select('*')
      .eq('status', 'active');

    if (affiliatesError) {
      throw new InternalServerErrorException(affiliatesError.message);
    }

    const created: AffiliatePayout[] = [];
    const skipped: Array<{ affiliate_id: string; reason: string; available_cents: number }> =
      [];

    for (const row of affiliates ?? []) {
      const affiliate = mapAffiliate(row as Affiliate);
      const { data: items, error: itemsError } = await this.supabaseService
        .getClient()
        .from('affiliate_commission_items')
        .select('*')
        .eq('affiliate_id', affiliate.id)
        .eq('status', 'accrued')
        .is('payout_id', null);

      if (itemsError) {
        throw new InternalServerErrorException(itemsError.message);
      }

      const available = (items ?? []) as AffiliateCommissionItem[];
      const availableCents = available.reduce(
        (sum, item) => sum + Number(item.commission_amount_cents),
        0,
      );

      if (!canIncludeInPayout(availableCents, AFFILIATE_PAYOUT_MINIMUM_CENTS)) {
        skipped.push({
          affiliate_id: affiliate.id,
          reason: 'below_minimum',
          available_cents: availableCents,
        });
        continue;
      }

      const { data: payout, error: payoutError } = await this.supabaseService
        .getClient()
        .from('affiliate_payouts')
        .insert({
          affiliate_id: affiliate.id,
          period_year: periodYear,
          period_month: periodMonth,
          amount_cents: availableCents,
          pix_key_snapshot: affiliate.pix_key,
          pix_key_type_snapshot: affiliate.pix_key_type as AffiliatePixKeyType,
          status: 'draft',
        })
        .select('*')
        .single();

      if (payoutError) {
        if (payoutError.code === '23505') {
          skipped.push({
            affiliate_id: affiliate.id,
            reason: 'period_exists',
            available_cents: availableCents,
          });
          continue;
        }
        throw new InternalServerErrorException(payoutError.message);
      }

      const payoutId = (payout as AffiliatePayout).id;
      const ids = available.map((item) => item.id);
      const { error: attachError } = await this.supabaseService
        .getClient()
        .from('affiliate_commission_items')
        .update({ payout_id: payoutId })
        .in('id', ids);

      if (attachError) {
        throw new InternalServerErrorException(attachError.message);
      }

      created.push(payout as AffiliatePayout);
    }

    return { created, skipped };
  }

  async markPayoutPaid(
    payoutId: string,
    platformAdminId: string,
    externalRef?: string,
  ) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('affiliate_payouts')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_by_platform_admin_id: platformAdminId,
        external_ref: externalRef?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payoutId)
      .eq('status', 'draft')
      .select('*')
      .single();

    if (error || !data) {
      throw new ForbiddenException('Folha não encontrada ou já processada.');
    }

    return data as AffiliatePayout;
  }

  async listPayoutsForPlatform() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('affiliate_payouts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as AffiliatePayout[];
  }

  private async findById(id: string): Promise<Affiliate | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('affiliates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapAffiliate(data as Affiliate) : null;
  }

  private async allocateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateAffiliateCode();
      const existing = await this.findByCode(code);
      if (!existing) {
        return code;
      }
    }
    throw new InternalServerErrorException('Não foi possível gerar um código único.');
  }
}
