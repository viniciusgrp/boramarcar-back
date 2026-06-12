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
