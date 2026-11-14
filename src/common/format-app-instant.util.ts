import { APP_TIME_ZONE } from './app-time-zone';

/**
 * Formats a real timestamptz instant as America/Sao_Paulo wall-clock digits in
 * the same `…THH:mm:ss.000Z` wire shape used for shop appointments.
 *
 * Use for true instants (e.g. `product_sales.created_at`, cash_flow `created_at`).
 * Do NOT use for appointment `start_time` / `end_time` — those already store
 * shop clock digits in the UTC component and must not be zone-shifted.
 */
export function formatAppInstantAsWallClockIso(
  value: string | null | undefined,
): string {
  const trimmed = value?.trim() ?? '';

  if (!trimmed) {
    return '';
  }

  const instant = new Date(trimmed);

  if (Number.isNaN(instant.getTime())) {
    return trimmed;
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';

  let hour = read('hour');
  if (hour === '24') {
    hour = '00';
  }

  return `${read('year')}-${read('month')}-${read('day')}T${hour}:${read('minute')}:${read('second')}.000Z`;
}
