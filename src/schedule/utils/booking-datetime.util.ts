import { parseISO } from 'date-fns';

/** Shop-local default when the tenant has no IANA timezone configured. */
export const DEFAULT_BOOKING_TIME_ZONE = 'America/Sao_Paulo';

const HAS_EXPLICIT_OFFSET = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const NAIVE_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

export interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * IANA zone from the tenant, or America/Sao_Paulo when missing or invalid.
 */
export function resolveBookingTimeZone(timeZone?: string | null): string {
  const trimmed = timeZone?.trim();

  if (!trimmed) {
    return DEFAULT_BOOKING_TIME_ZONE;
  }

  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_BOOKING_TIME_ZONE;
  }
}

export function hasExplicitDateTimeOffset(value: string): boolean {
  return HAS_EXPLICIT_OFFSET.test(value.trim());
}

/**
 * Booking input → wall-clock Date whose local fields are the shop's clock.
 *
 * Naive values (no offset and no Z) are the tenant's local time.
 * Values with an explicit offset or Z stay absolute instants and are then
 * projected into that same timezone.
 */
export function parseBookingDateTime(
  value: string,
  timeZone?: string | null,
): Date {
  const trimmed = value.trim();
  const zone = resolveBookingTimeZone(timeZone);

  if (hasExplicitDateTimeOffset(trimmed)) {
    const instant = parseISO(trimmed);

    if (Number.isNaN(instant.getTime())) {
      return new Date(NaN);
    }

    return instantToWallClock(instant, zone);
  }

  return naiveToWallClock(trimmed);
}

/**
 * Stored appointment timestamps are real instants (timestamptz).
 * Legacy strings without an offset are already shop wall-clock digits.
 */
export function storedBookingInstantToWallClock(
  value: string,
  timeZone?: string | null,
): Date {
  const trimmed = value.trim();

  if (!hasExplicitDateTimeOffset(trimmed)) {
    return naiveToWallClock(trimmed);
  }

  const instant = parseISO(trimmed);

  if (Number.isNaN(instant.getTime())) {
    return new Date(NaN);
  }

  return instantToWallClock(instant, resolveBookingTimeZone(timeZone));
}

/** Shop wall-clock Date → UTC ISO instant in the tenant timezone. */
export function bookingWallClockToInstantIso(
  wallClock: Date,
  timeZone?: string | null,
): string {
  return zonedWallClockToUtc(
    {
      year: wallClock.getFullYear(),
      month: wallClock.getMonth() + 1,
      day: wallClock.getDate(),
      hour: wallClock.getHours(),
      minute: wallClock.getMinutes(),
      second: wallClock.getSeconds(),
    },
    resolveBookingTimeZone(timeZone),
  ).toISOString();
}

/** Inclusive UTC bounds of a civil day in the tenant timezone. */
export function bookingDayBoundsIso(
  date: string,
  timeZone?: string | null,
): { start: string; end: string } {
  const [year, month, day] = date.split('-').map(Number);
  const zone = resolveBookingTimeZone(timeZone);
  const start = zonedWallClockToUtc(
    { year, month, day, hour: 0, minute: 0, second: 0 },
    zone,
  );
  const end = zonedWallClockToUtc(
    { year, month, day, hour: 23, minute: 59, second: 59 },
    zone,
  );

  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Real instant → ISO with the tenant's offset (e.g. 10:00 in São Paulo is
 * `2026-11-14T10:00:00.000-03:00`). Posting that value back books the same
 * local time. Strings that are already naive are returned unchanged.
 */
export function formatBookingLocalIso(
  value: string,
  timeZone?: string | null,
): string {
  const trimmed = value.trim();

  if (!trimmed || !hasExplicitDateTimeOffset(trimmed)) {
    return trimmed;
  }

  const instant = parseISO(trimmed);

  if (Number.isNaN(instant.getTime())) {
    return trimmed;
  }

  const zone = resolveBookingTimeZone(timeZone);
  const parts = getZonedParts(instant, zone);
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offsetMinutes = Math.round((wallAsUtc - instant.getTime()) / 60000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const offsetMins = String(absolute % 60).padStart(2, '0');

  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}.000${sign}${offsetHours}:${offsetMins}`;
}

function naiveToWallClock(value: string): Date {
  const match = NAIVE_DATE_TIME.exec(value.trim());

  if (!match) {
    const parsed = parseISO(value);

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

  const milliseconds = match[7] ? Number(match[7].padEnd(3, '0')) : 0;

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0),
    milliseconds,
  );
}

function instantToWallClock(instant: Date, timeZone: string): Date {
  const parts = getZonedParts(instant, timeZone);

  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

export function getZonedParts(
  date: Date,
  timeZone: string,
): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const read = (type: string): number => {
    const value = parts.find((part) => part.type === type)?.value;
    return Number.parseInt(value ?? '0', 10);
  };
  let hour = read('hour');

  if (hour === 24) {
    hour = 0;
  }

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

function zonedWallClockToUtc(
  parts: ZonedDateTimeParts,
  timeZone: string,
): Date {
  const desired = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let guess = new Date(desired);

  for (let index = 0; index < 4; index += 1) {
    const zoned = getZonedParts(guess, timeZone);
    const actual = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    );
    const delta = desired - actual;

    if (delta === 0) {
      break;
    }

    guess = new Date(guess.getTime() + delta);
  }

  return guess;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}
