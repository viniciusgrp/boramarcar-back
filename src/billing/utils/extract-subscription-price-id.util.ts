/** Reads the primary recurring price id from a Stripe Subscription payload. */
export function extractSubscriptionPriceId(subscription: unknown): string | null {
  if (!subscription || typeof subscription !== 'object') {
    return null;
  }

  const record = subscription as Record<string, unknown>;
  const items = record.items;

  if (!items || typeof items !== 'object') {
    return null;
  }

  const data = (items as Record<string, unknown>).data;

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const firstItem = data[0] as Record<string, unknown>;
  const price = firstItem.price;

  if (price && typeof price === 'object') {
    const priceId = (price as Record<string, unknown>).id;

    if (typeof priceId === 'string' && priceId.startsWith('price_')) {
      return priceId;
    }
  }

  if (typeof firstItem.price === 'string') {
    return firstItem.price;
  }

  return null;
}
