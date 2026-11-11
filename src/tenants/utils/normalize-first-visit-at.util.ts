/**
 * Normalizes marketing first-touch timestamps from the frontend.
 *
 * Accepts epoch milliseconds (number or numeric string) or an ISO 8601 string.
 * Returns a canonical ISO 8601 UTC string, or null when missing/invalid
 * (callers should drop the value rather than fail signup).
 */
export function normalizeFirstVisitAt(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return epochMsToIso(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return epochMsToIso(Number(trimmed));
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  }

  return null;
}

function epochMsToIso(ms: number): string | null {
  if (!Number.isFinite(ms)) {
    return null;
  }

  const parsed = new Date(ms);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}
