export type SubscriptionStatus =
  | 'INACTIVE'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED';

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'INACTIVE',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
];
