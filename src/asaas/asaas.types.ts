export type AsaasBillingType =
  | 'UNDEFINED'
  | 'PIX'
  | 'BOLETO'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD';

export type AsaasSubscriptionStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'DELETED';

export type AsaasPaymentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'RECEIVED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'RECEIVED_IN_CASH'
  | 'REFUND_REQUESTED'
  | 'CHARGEBACK_REQUESTED'
  | 'CHARGEBACK_DISPUTE'
  | 'AWAITING_CHARGEBACK_REVERSAL'
  | 'DUNNING_REQUESTED'
  | 'DUNNING_RECEIVED'
  | 'AWAITING_RISK_ANALYSIS'
  | 'DELETED';

export interface AsaasCustomer {
  id: string;
  name?: string;
  email?: string;
  cpfCnpj?: string | null;
  externalReference?: string | null;
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  nextDueDate?: string | null;
  cycle?: string;
  billingType?: AsaasBillingType;
  status?: AsaasSubscriptionStatus | string;
  description?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
}

export interface AsaasPayment {
  id: string;
  customer?: string;
  subscription?: string | null;
  value?: number;
  netValue?: number;
  billingType?: AsaasBillingType | string;
  status?: AsaasPaymentStatus | string;
  dueDate?: string | null;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  invoiceUrl?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
}

export interface AsaasCheckout {
  id: string;
  link?: string | null;
  status?: string | null;
  externalReference?: string | null;
}

export interface AsaasAccount {
  id?: string;
  walletId?: string;
  apiKey?: string;
  accountStatus?: {
    commercialInfo?: string;
    bankAccountInfo?: string;
    documentation?: string;
    general?: string;
  };
}

/** GET /v3/myAccount/status authenticated with the subaccount apiKey. */
export interface AsaasMyAccountStatus {
  commercialInfo?: string;
  bankAccountInfo?: string;
  documentation?: string;
  general?: string;
}

export interface AsaasListResponse<T> {
  object?: string;
  hasMore?: boolean;
  totalCount?: number;
  limit?: number;
  offset?: number;
  data?: T[];
}

export interface AsaasErrorBody {
  errors?: Array<{ code?: string; description?: string }>;
}

export interface AsaasWebhookEvent {
  id?: string;
  event?: string;
  payment?: AsaasPayment;
  subscription?: AsaasSubscription;
  checkout?: AsaasCheckout;
  account?: AsaasAccount & { id?: string };
}

export interface AsaasWebhookConfig {
  name: string;
  url: string;
  email: string;
  enabled: boolean;
  interrupted: boolean;
  apiVersion: 3;
  authToken: string;
  sendType: 'SEQUENTIALLY';
  events: string[];
}

export type AsaasCompanyType =
  | 'MEI'
  | 'LIMITED'
  | 'INDIVIDUAL'
  | 'ASSOCIATION';

export interface CreateAsaasAccountPayload {
  name: string;
  email: string;
  cpfCnpj: string;
  incomeValue: number;
  phone?: string;
  mobilePhone?: string;
  address: string;
  addressNumber: string;
  complement?: string;
  province: string;
  postalCode: string;
  /** Required by Asaas for CPF accounts (YYYY-MM-DD). */
  birthDate?: string;
  /** Required by Asaas for CNPJ accounts. */
  companyType?: AsaasCompanyType;
  webhooks?: AsaasWebhookConfig[];
}
