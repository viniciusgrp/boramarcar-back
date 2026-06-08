import type { LoyaltyTransactionType } from './loyalty-transaction-type.type';

export interface LoyaltyTransaction {
  id: string;
  tenant_id: string;
  customer_id: string;
  type: LoyaltyTransactionType;
  points: number;
  description: string;
  appointment_id: string | null;
  created_at: string;
}
