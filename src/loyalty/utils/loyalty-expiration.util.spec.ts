import { computePointsToExpire } from './loyalty-expiration.util';

describe('computePointsToExpire', () => {
  it('returns 0 when balance is empty', () => {
    expect(
      computePointsToExpire({
        transactions: [],
        cutoffIso: '2026-01-01T00:00:00.000Z',
        currentBalance: 0,
      }),
    ).toBe(0);
  });

  it('expires only unconsumed earn lots older than cutoff (FIFO)', () => {
    const result = computePointsToExpire({
      transactions: [
        {
          type: 'EARNED',
          points: 100,
          description: 'earn-old',
          created_at: '2025-01-01T00:00:00.000Z',
        },
        {
          type: 'REDEEMED',
          points: 40,
          description: 'redeem',
          created_at: '2025-02-01T00:00:00.000Z',
        },
        {
          type: 'EARNED',
          points: 30,
          description: 'earn-new',
          created_at: '2026-06-01T00:00:00.000Z',
        },
      ],
      cutoffIso: '2026-01-01T00:00:00.000Z',
      currentBalance: 90,
    });

    // Old lot had 60 remaining after redeem; new lot is after cutoff.
    expect(result).toBe(60);
  });

  it('never expires more than current balance', () => {
    const result = computePointsToExpire({
      transactions: [
        {
          type: 'EARNED',
          points: 50,
          description: 'earn',
          created_at: '2025-01-01T00:00:00.000Z',
        },
      ],
      cutoffIso: '2026-01-01T00:00:00.000Z',
      currentBalance: 10,
    });

    expect(result).toBe(10);
  });
});
