export type AffiliateStatus =
  | 'pending_terms'
  | 'pending_review'
  | 'active'
  | 'suspended'
  | 'rejected';

export type AffiliatePixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export type AffiliateCommissionStatus = 'accrued' | 'reversed';

export type AffiliatePayoutStatus = 'draft' | 'paid' | 'failed';

export interface Affiliate {
  id: string;
  auth_user_id: string;
  code: string;
  status: AffiliateStatus;
  full_name: string;
  email: string;
  cpf: string;
  cnpj: string | null;
  phone: string | null;
  pix_key: string;
  pix_key_type: AffiliatePixKeyType;
  commission_percent: number;
  terms_version: string;
  terms_accepted_at: string;
  terms_ip: string | null;
  terms_user_agent: string | null;
  ack_independent_partnership: boolean;
  ack_autonomy: boolean;
  ack_result_only_pay: boolean;
  ack_own_taxes: boolean;
  ack_no_employment: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateCommissionItem {
  id: string;
  affiliate_id: string;
  tenant_id: string;
  stripe_invoice_id: string;
  invoice_paid_at: string;
  gross_amount_cents: number;
  commission_amount_cents: number;
  status: AffiliateCommissionStatus;
  reversal_reason: string | null;
  payout_id: string | null;
  created_at: string;
}

export interface AffiliatePayout {
  id: string;
  affiliate_id: string;
  period_year: number;
  period_month: number;
  amount_cents: number;
  pix_key_snapshot: string;
  pix_key_type_snapshot: AffiliatePixKeyType;
  status: AffiliatePayoutStatus;
  paid_at: string | null;
  paid_by_platform_admin_id: string | null;
  external_ref: string | null;
  created_at: string;
  updated_at: string;
}
