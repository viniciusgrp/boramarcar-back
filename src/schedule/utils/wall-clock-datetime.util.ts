import { format, parse, parseISO, setHours, setMinutes } from 'date-fns';

const HAS_TIMEZONE_OFFSET = /([zZ]|[+-]\d{2}:?\d{2})$/;
const BRAZIL_TIMEZONE = 'America/Sao_Paulo';

/**
 * Business times are naive wall-clock values in Brazil (e.g. 17:30 means 17:30
 * local at the shop). Appointment rows store those clock fields in the UTC
 * component of the ISO string (…T17:30:00.000Z).
 */
export function parseWallClockDateTime(value: string): Date {
  const trimmed = value.trim();
  const parsed = parseISO(trimmed);

  if (!HAS_TIMEZONE_OFFSET.test(trimmed)) {
    return new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      parsed.getHours(),
      parsed.getMinutes(),
      parsed.getSeconds(),
      parsed.getMilliseconds(),
    );
  }

  return new Date(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
    parsed.getUTCHours(),
    parsed.getUTCMinutes(),
    parsed.getUTCSeconds(),
    parsed.getUTCMilliseconds(),
  );
}

export function buildWallClockDateTime(date: string, time: string): Date {
  const dayBase = parse(date, 'yyyy-MM-dd', new Date());
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);

  return setMinutes(setHours(dayBase, hours), minutes);
}

export function combineWallClockDayAndTime(
  dayBase: Date,
  timeValue: string,
): Date {
  const [hours, minutes] = timeValue.trim().slice(0, 5).split(':').map(Number);

  return setMinutes(setHours(dayBase, hours), minutes);
}

export function getWallClockNow(): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRAZIL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

export function wallClockToStorageIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000Z`;
}

export function formatWallClockDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function isSameWallClockDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
