export type SupportAiStatus =
  | 'inactive'
  | 'active'
  | 'past_due'
  | 'canceled';

export const SUPPORT_AI_STATUSES: SupportAiStatus[] = [
  'inactive',
  'active',
  'past_due',
  'canceled',
];

export function normalizeSupportAiStatus(
  value: string | null | undefined,
): SupportAiStatus | null {
  if (!value?.trim()) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (SUPPORT_AI_STATUSES.includes(normalized as SupportAiStatus)) {
    return normalized as SupportAiStatus;
  }

  return null;
}
