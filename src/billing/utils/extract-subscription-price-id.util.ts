import { extractSubscriptionItems } from './extract-subscription-items.util';

export interface ExtractSubscriptionPriceIdOptions {
  /** Price IDs to ignore (ex.: add-on Assistente IA). */
  excludePriceIds?: string[];
}

/** Reads the primary recurring plan price id from a Stripe Subscription payload. */
export function extractSubscriptionPriceId(
  subscription: unknown,
  options?: ExtractSubscriptionPriceIdOptions,
): string | null {
  const excluded = new Set(
    (options?.excludePriceIds ?? [])
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id)),
  );

  for (const item of extractSubscriptionItems(subscription)) {
    if (excluded.has(item.priceId)) {
      continue;
    }
    return item.priceId;
  }

  // Fallback for payloads without item ids (si_...) but with prices.
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

  for (const item of data) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    const price = itemRecord.price;

    let priceId: string | null = null;

    if (price && typeof price === 'object') {
      const id = (price as Record<string, unknown>).id;
      if (typeof id === 'string' && id.startsWith('price_')) {
        priceId = id;
      }
    } else if (typeof price === 'string' && price.startsWith('price_')) {
      priceId = price;
    } else {
      const plan = itemRecord.plan;
      if (plan && typeof plan === 'object') {
        const planId = (plan as Record<string, unknown>).id;
        if (typeof planId === 'string' && planId.startsWith('price_')) {
          priceId = planId;
        }
      }
    }

    if (!priceId || excluded.has(priceId)) {
      continue;
    }

    return priceId;
  }

  return null;
}
