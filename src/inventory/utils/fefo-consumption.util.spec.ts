import { selectLotsForConsumptionFefo } from './fefo-consumption.util';

describe('selectLotsForConsumptionFefo', () => {
  it('consumes the lot with the closest expiry date first', () => {
    const result = selectLotsForConsumptionFefo(
      [
        {
          id: 'lot-far',
          expiryDate: '2027-01-01',
          receivedAt: '2026-01-01T00:00:00.000Z',
          quantityRemaining: 10,
          unitCost: 5,
        },
        {
          id: 'lot-near',
          expiryDate: '2026-06-01',
          receivedAt: '2026-01-05T00:00:00.000Z',
          quantityRemaining: 10,
          unitCost: 4,
        },
      ],
      5,
    );

    expect(result.shortfall).toBe(0);
    expect(result.consumptions).toEqual([
      { lotId: 'lot-near', quantity: 5, unitCost: 4 },
    ]);
  });

  it('spans multiple lots in expiry order when one lot is insufficient', () => {
    const result = selectLotsForConsumptionFefo(
      [
        {
          id: 'lot-near',
          expiryDate: '2026-06-01',
          receivedAt: '2026-01-05T00:00:00.000Z',
          quantityRemaining: 3,
          unitCost: 4,
        },
        {
          id: 'lot-far',
          expiryDate: '2027-01-01',
          receivedAt: '2026-01-01T00:00:00.000Z',
          quantityRemaining: 10,
          unitCost: 5,
        },
      ],
      5,
    );

    expect(result.shortfall).toBe(0);
    expect(result.consumptions).toEqual([
      { lotId: 'lot-near', quantity: 3, unitCost: 4 },
      { lotId: 'lot-far', quantity: 2, unitCost: 5 },
    ]);
  });

  it('consumes lots without expiry date last, oldest first (FIFO)', () => {
    const result = selectLotsForConsumptionFefo(
      [
        {
          id: 'lot-no-expiry-old',
          expiryDate: null,
          receivedAt: '2026-01-01T00:00:00.000Z',
          quantityRemaining: 5,
          unitCost: 3,
        },
        {
          id: 'lot-with-expiry',
          expiryDate: '2026-08-01',
          receivedAt: '2026-02-01T00:00:00.000Z',
          quantityRemaining: 5,
          unitCost: 4,
        },
      ],
      7,
    );

    expect(result.consumptions).toEqual([
      { lotId: 'lot-with-expiry', quantity: 5, unitCost: 4 },
      { lotId: 'lot-no-expiry-old', quantity: 2, unitCost: 3 },
    ]);
  });

  it('reports a shortfall when total remaining stock is insufficient', () => {
    const result = selectLotsForConsumptionFefo(
      [
        {
          id: 'lot-a',
          expiryDate: '2026-06-01',
          receivedAt: '2026-01-01T00:00:00.000Z',
          quantityRemaining: 2,
          unitCost: 4,
        },
      ],
      5,
    );

    expect(result.shortfall).toBe(3);
    expect(result.consumptions).toEqual([
      { lotId: 'lot-a', quantity: 2, unitCost: 4 },
    ]);
  });

  it('ignores lots with zero remaining quantity', () => {
    const result = selectLotsForConsumptionFefo(
      [
        {
          id: 'lot-empty',
          expiryDate: '2026-01-01',
          receivedAt: '2026-01-01T00:00:00.000Z',
          quantityRemaining: 0,
          unitCost: 4,
        },
        {
          id: 'lot-full',
          expiryDate: '2026-06-01',
          receivedAt: '2026-01-01T00:00:00.000Z',
          quantityRemaining: 5,
          unitCost: 6,
        },
      ],
      3,
    );

    expect(result.consumptions).toEqual([
      { lotId: 'lot-full', quantity: 3, unitCost: 6 },
    ]);
  });
});
