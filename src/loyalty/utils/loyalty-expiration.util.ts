export interface LoyaltyLedgerRowForExpiration {
  type: string;
  points: number;
  description: string | null;
  created_at: string;
}

/**
 * FIFO remaining lots: expire only unconsumed earn lots older than cutoff.
 * All EARNED rows (including redeem refunds) create lots at their created_at.
 * REDEEMED / EXPIRED consume oldest lots first so the same earn is not re-expired.
 */
export function computePointsToExpire(params: {
  transactions: LoyaltyLedgerRowForExpiration[];
  cutoffIso: string;
  currentBalance: number;
}): number {
  if (params.currentBalance <= 0) {
    return 0;
  }

  const cutoffMs = Date.parse(params.cutoffIso);
  if (Number.isNaN(cutoffMs)) {
    return 0;
  }

  const lots: Array<{ earnedAtMs: number; remaining: number }> = [];

  const sorted = [...params.transactions].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  for (const row of sorted) {
    const points = Number(row.points ?? 0);
    if (points <= 0) {
      continue;
    }

    const earnedAtMs = Date.parse(row.created_at);
    if (Number.isNaN(earnedAtMs)) {
      continue;
    }

    if (row.type === 'EARNED') {
      lots.push({ earnedAtMs, remaining: points });
      continue;
    }

    if (row.type === 'REDEEMED' || row.type === 'EXPIRED') {
      let left = points;
      for (const lot of lots) {
        if (left <= 0) {
          break;
        }
        const take = Math.min(lot.remaining, left);
        lot.remaining -= take;
        left -= take;
      }
    }
  }

  let staleRemaining = 0;
  for (const lot of lots) {
    if (lot.remaining > 0 && lot.earnedAtMs <= cutoffMs) {
      staleRemaining += lot.remaining;
    }
  }

  return Math.min(params.currentBalance, staleRemaining);
}
