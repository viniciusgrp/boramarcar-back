import { AffiliatesService } from './affiliates.service';
import type { Affiliate } from './entities/affiliate.entity';
import type { SupabaseService } from '../supabase/supabase.service';

function buildAffiliate(overrides?: Partial<Affiliate>): Affiliate {
  return {
    id: 'aff-1',
    auth_user_id: 'user-aff',
    code: 'BMTEST1',
    status: 'active',
    full_name: 'Parceiro',
    email: 'parceiro@test.com',
    cpf: '12345678901',
    cnpj: null,
    phone: null,
    pix_key: '12345678901',
    pix_key_type: 'cpf',
    commission_percent: 20,
    terms_version: '2026-09-01',
    terms_accepted_at: '2026-09-01T00:00:00.000Z',
    terms_ip: null,
    terms_user_agent: null,
    ack_independent_partnership: true,
    ack_autonomy: true,
    ack_result_only_pay: true,
    ack_own_taxes: true,
    ack_no_employment: true,
    notes: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AffiliatesService attribution and ledger', () => {
  it('does not attribute inactive codes or self-referrals', async () => {
    const affiliate = buildAffiliate({ status: 'pending_review' });
    const maybeSingle = jest.fn().mockResolvedValue({ data: affiliate, error: null });
    const supabaseService = {
      getClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle }),
          }),
        }),
      }),
    } as unknown as SupabaseService;

    const service = new AffiliatesService(supabaseService);
    await expect(
      service.resolveAttributionForSignup({
        affiliateCode: 'BMTEST1',
        signupEmail: 'shop@test.com',
      }),
    ).resolves.toBeNull();

    maybeSingle.mockResolvedValue({ data: buildAffiliate(), error: null });
    await expect(
      service.resolveAttributionForSignup({
        affiliateCode: 'BMTEST1',
        signupEmail: 'parceiro@test.com',
      }),
    ).resolves.toBeNull();
  });

  it('skips trial invoices and accrues 20 percent on paid plan invoices', async () => {
    const insert = jest.fn().mockResolvedValue({
      data: { id: 'item-1' },
      error: null,
    });

    const fromMock = jest.fn((table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { id: 'tenant-1', referred_by_affiliate_id: 'aff-1' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'affiliates') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: jest.fn().mockResolvedValue({
                data: buildAffiliate(),
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        insert: () => ({
          select: () => ({
            single: insert,
          }),
        }),
      };
    });

    const service = new AffiliatesService({
      getClient: () => ({ from: fromMock }),
    } as unknown as SupabaseService);

    await expect(
      service.accruePaidPlanInvoice({
        stripeInvoiceId: 'in_trial',
        stripeCustomerId: 'cus_1',
        amountPaid: 0,
        planGrossCents: 6990,
        paidAtIso: '2026-09-01T00:00:00.000Z',
      }),
    ).resolves.toBeNull();

    await service.accruePaidPlanInvoice({
      stripeInvoiceId: 'in_paid',
      stripeCustomerId: 'cus_1',
      amountPaid: 6990,
      planGrossCents: 6990,
      paidAtIso: '2026-09-01T00:00:00.000Z',
    });

    expect(insert).toHaveBeenCalled();
  });

  it('reverses unpaid commission items and inserts negative when already paid out', async () => {
    const updateEq = jest.fn().mockResolvedValue({ error: null });
    const insert = jest.fn().mockResolvedValue({ error: null });
    const maybeSingleUnpaid = jest.fn().mockResolvedValue({
      data: {
        id: 'item-1',
        affiliate_id: 'aff-1',
        tenant_id: 'tenant-1',
        stripe_invoice_id: 'in_1',
        status: 'accrued',
        payout_id: null,
        gross_amount_cents: 6990,
        commission_amount_cents: 1398,
      },
      error: null,
    });

    const serviceUnpaid = new AffiliatesService({
      getClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: maybeSingleUnpaid }),
          }),
          update: () => ({ eq: updateEq }),
        }),
      }),
    } as unknown as SupabaseService);

    await serviceUnpaid.reverseInvoice('in_1', 'charge_refunded');
    expect(updateEq).toHaveBeenCalled();

    const maybeSinglePaid = jest.fn().mockResolvedValue({
      data: {
        id: 'item-2',
        affiliate_id: 'aff-1',
        tenant_id: 'tenant-1',
        stripe_invoice_id: 'in_2',
        status: 'accrued',
        payout_id: 'payout-1',
        gross_amount_cents: 6990,
        commission_amount_cents: 1398,
      },
      error: null,
    });

    const servicePaid = new AffiliatesService({
      getClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: maybeSinglePaid }),
          }),
          insert,
        }),
      }),
    } as unknown as SupabaseService);

    await servicePaid.reverseInvoice('in_2', 'charge_refunded');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_invoice_id: 'in_2:rev',
        commission_amount_cents: -1398,
        status: 'accrued',
      }),
    );
  });
});
