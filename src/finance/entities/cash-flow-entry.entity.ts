export type CashFlowEntryType = 'REVENUE' | 'EXPENSE';

export interface CashFlowEntry {
  id: string;
  tenant_id: string;
  type: CashFlowEntryType;
  amount: number;
  description: string;
  category: string;
  cash_register_id: string | null;
  is_recurring: boolean;
  created_at: string;
}

export interface CashFlowSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
}

/** Public list row for the cash-flow ledger (B5). */
export interface CashFlowLedgerEntry {
  id: string;
  type: CashFlowEntryType;
  amount: number;
  description: string;
  category: string;
  paymentMethod: string | null;
  appointmentId: string | null;
  productSaleId: string | null;
  cashRegisterId: string | null;
  createdAt: string;
}
