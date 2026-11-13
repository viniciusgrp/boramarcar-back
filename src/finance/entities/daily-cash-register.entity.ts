export type CashRegisterStatus = 'OPEN' | 'CLOSED';

export interface DailyCashRegister {
  id: string;
  tenant_id: string;
  opened_by: string;
  closed_by: string | null;
  opening_balance: number;
  closing_balance: number | null;
  status: CashRegisterStatus;
  opened_at: string;
  closed_at: string | null;
}

export interface OpenCashRegisterSummary {
  id: string;
  openingBalance: number;
  openedAt: string;
  status: CashRegisterStatus;
  estimatedBalance: number;
  periodRevenue: number;
  periodExpenses: number;
}

export interface CashRegisterStatusResponse {
  register: OpenCashRegisterSummary | null;
}

export interface OpenCashRegistersResponse {
  registers: OpenCashRegisterSummary[];
}

export interface CloseCashRegisterResponse {
  register: DailyCashRegister;
  expectedBalance: number;
  closingBalance: number;
  discrepancy: number;
}
