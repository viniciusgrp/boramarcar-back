/**
 * Formats appointment start_time for owner emails.
 *
 * start_time is stored as shop wall-clock digits in UTC
 * (T14:00:00.000Z means 14:00 at the shop). Use UTC components only —
 * do not convert to America/Sao_Paulo.
 *
 * Examples: "sexta, 20/11, às 14h" | "sexta, 20/11, às 14h30"
 */
const WEEKDAYS_PT = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
] as const;

export function formatAppointmentWallClockDateTime(
  startTimeIso: string,
): string | null {
  const trimmed = startTimeIso?.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const weekday = WEEKDAYS_PT[date.getUTCDay()];
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();

  const timeLabel =
    minutes === 0 ? `às ${hours}h` : `às ${hours}h${String(minutes).padStart(2, '0')}`;

  return `${weekday}, ${day}/${month}, ${timeLabel}`;
}

export function resolveCustomerFirstName(
  customerName: string | null | undefined,
): string {
  const first = customerName?.trim().split(/\s+/)[0]?.trim();
  return first || 'Um cliente';
}
