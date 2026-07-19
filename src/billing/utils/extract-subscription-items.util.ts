export interface StripeSubscriptionItemRef {
  itemId: string;
  priceId: string;
}

function readPriceId(itemRecord: Record<string, unknown>): string | null {
  const price = itemRecord.price;

  if (price && typeof price === 'object') {
    const priceId = (price as Record<string, unknown>).id;
    if (typeof priceId === 'string' && priceId.startsWith('price_')) {
      return priceId;
    }
  }

  if (typeof price === 'string' && price.startsWith('price_')) {
    return price;
  }

  const plan = itemRecord.plan;
  if (plan && typeof plan === 'object') {
    const planId = (plan as Record<string, unknown>).id;
    if (typeof planId === 'string' && planId.startsWith('price_')) {
      return planId;
    }
  }

  return null;
}

/** Lista items (id + price) de um payload de Subscription Stripe. */
export function extractSubscriptionItems(
  subscription: unknown,
): StripeSubscriptionItemRef[] {
  if (!subscription || typeof subscription !== 'object') {
    return [];
  }

  const record = subscription as Record<string, unknown>;
  const items = record.items;

  if (!items || typeof items !== 'object') {
    return [];
  }

  const data = (items as Record<string, unknown>).data;
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }

  const result: StripeSubscriptionItemRef[] = [];

  for (const item of data) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    const itemId = itemRecord.id;
    const priceId = readPriceId(itemRecord);

    if (typeof itemId !== 'string' || !itemId.startsWith('si_') || !priceId) {
      continue;
    }

    result.push({ itemId, priceId });
  }

  return result;
}

export function findSubscriptionItemByPriceId(
  subscription: unknown,
  priceId: string | null | undefined,
): StripeSubscriptionItemRef | null {
  if (!priceId?.trim()) {
    return null;
  }

  const normalized = priceId.trim();
  return (
    extractSubscriptionItems(subscription).find(
      (item) => item.priceId === normalized,
    ) ?? null
  );
}
