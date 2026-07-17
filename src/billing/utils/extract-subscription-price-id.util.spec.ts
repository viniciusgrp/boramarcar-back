import { extractSubscriptionPriceId } from './extract-subscription-price-id.util';
import { findSubscriptionItemByPriceId } from './extract-subscription-items.util';

describe('extractSubscriptionPriceId', () => {
  const subscription = {
    items: {
      data: [
        {
          id: 'si_plan',
          price: { id: 'price_pro' },
        },
        {
          id: 'si_ai',
          price: { id: 'price_support_ai' },
        },
      ],
    },
  };

  it('returns the first plan price when no exclusions', () => {
    expect(extractSubscriptionPriceId(subscription)).toBe('price_pro');
  });

  it('skips excluded add-on price ids', () => {
    expect(
      extractSubscriptionPriceId(subscription, {
        excludePriceIds: ['price_support_ai'],
      }),
    ).toBe('price_pro');
  });

  it('skips add-on when it is listed first', () => {
    const reversed = {
      items: {
        data: [
          { id: 'si_ai', price: { id: 'price_support_ai' } },
          { id: 'si_plan', price: { id: 'price_elite' } },
        ],
      },
    };

    expect(
      extractSubscriptionPriceId(reversed, {
        excludePriceIds: ['price_support_ai'],
      }),
    ).toBe('price_elite');
  });

  it('finds the support AI subscription item by price', () => {
    expect(
      findSubscriptionItemByPriceId(subscription, 'price_support_ai'),
    ).toEqual({ itemId: 'si_ai', priceId: 'price_support_ai' });
  });
});
