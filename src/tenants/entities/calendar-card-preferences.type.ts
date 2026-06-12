export const CALENDAR_SUMMARY_CARD_KEYS = [
  'dayTotal',
  'pending',
  'pendingApproval',
  'pendingPayment',
  'confirmed',
  'completed',
  'cancelled',
  'noShow',
  'overdue',
  'dayRevenue',
] as const;

export type CalendarSummaryCardKey =
  (typeof CALENDAR_SUMMARY_CARD_KEYS)[number];

export type CalendarCardPreferences = Record<CalendarSummaryCardKey, boolean>;

export const DEFAULT_CALENDAR_CARD_PREFERENCES: CalendarCardPreferences = {
  dayTotal: true,
  pending: true,
  pendingApproval: false,
  pendingPayment: false,
  confirmed: true,
  completed: true,
  cancelled: false,
  noShow: false,
  overdue: true,
  dayRevenue: false,
};
