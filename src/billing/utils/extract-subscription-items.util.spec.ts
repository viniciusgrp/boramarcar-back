import {
  extractSubscriptionItems,
  findSubscriptionItemByPriceId,
} from './extract-subscription-items.util';

describe('extract-subscription-items.util', () => {
  const subscription = {
    items: {
      data: [
        { id: 'si_1', price: { id: 'price_plan' } },
        { id: 'si_2', price: 'price_addon' },
        { id: 'not-an-item', price: { id: 'price_x' } },
      ],
    },
  };

  it('keeps only Stripe subscription items with price ids', () => {
    expect(extractSubscriptionItems(subscription)).toEqual([
      { itemId: 'si_1', priceId: 'price_plan' },
      { itemId: 'si_2', priceId: 'price_addon' },
    ]);
  });

  it('finds an item by price id', () => {
    expect(findSubscriptionItemByPriceId(subscription, 'price_addon')).toEqual({
      itemId: 'si_2',
      priceId: 'price_addon',
    });
    expect(findSubscriptionItemByPriceId(subscription, null)).toBeNull();
  });
});
