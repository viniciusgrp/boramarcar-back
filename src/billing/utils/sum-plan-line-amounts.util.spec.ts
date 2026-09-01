import {
  collectPlanPriceIds,
  sumPlanLineAmountsCents,
} from './sum-plan-line-amounts.util';

describe('sumPlanLineAmountsCents', () => {
  const priceMap = {
    SOLO: ['price_solo'],
    PRO: ['price_pro'],
    ELITE: ['price_elite'],
  };
  const ids = collectPlanPriceIds(priceMap);

  it('sums only Solo/Pro/Elite price lines', () => {
    expect(
      sumPlanLineAmountsCents(
        [
          { amount: 6990, price: { id: 'price_pro' } },
          { amount: 2990, price: { id: 'price_support_ai' } },
        ],
        ids,
      ),
    ).toBe(6990);
  });

  it('returns 0 when there is no plan line', () => {
    expect(
      sumPlanLineAmountsCents(
        [{ amount: 2990, price: { id: 'price_support_ai' } }],
        ids,
      ),
    ).toBe(0);
  });
});
