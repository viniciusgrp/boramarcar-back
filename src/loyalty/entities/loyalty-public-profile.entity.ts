import type { Customer } from './customer.entity';
import type { LoyaltyReward } from './loyalty-reward.entity';
import type { LoyaltyTransaction } from './loyalty-transaction.entity';

export interface LoyaltyPublicProfile {
  isActive: boolean;
  customer: Customer | null;
  rewards: LoyaltyReward[];
  recentTransactions: LoyaltyTransaction[];
}
