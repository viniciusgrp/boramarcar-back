/**
 * Reads billing period end from a Stripe Subscription payload.
 * Stripe API v22+ exposes `current_period_end` on subscription items; older payloads may include it on the root.
 */
export function extractSubscriptionPeriodEnd(
  subscription: unknown,
): number | null {
  if (!subscription || typeof subscription !== 'object') {
    return null;
  }

  const record = subscription as Record<string, unknown>;
  const rootPeriodEnd = record.current_period_end;

  if (typeof rootPeriodEnd === 'number') {
    return rootPeriodEnd;
  }

  const items = record.items;

  if (items && typeof items === 'object') {
    const data = (items as Record<string, unknown>).data;

    if (Array.isArray(data) && data.length > 0) {
      const itemPeriodEnd = (data[0] as Record<string, unknown>)
        .current_period_end;

      if (typeof itemPeriodEnd === 'number') {
        return itemPeriodEnd;
      }
    }
  }

  return null;
}

/** Converts Stripe `current_period_end` (Unix seconds, UTC) to ISO-8601 for TIMESTAMPTZ storage. */
export function stripePeriodEndToIso(
  periodEnd: number | null | undefined,
): string | null {
  if (periodEnd === null || periodEnd === undefined) {
    return null;
  }

  if (!Number.isFinite(periodEnd) || periodEnd <= 0) {
    return null;
  }

  return new Date(periodEnd * 1000).toISOString();
}
