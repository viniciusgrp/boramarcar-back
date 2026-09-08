export function sumPlanLineAmountsCents(
  lines: Array<{
    amount?: number | null;
    price?: { id?: string | null } | null;
  }>,
  planPriceIds: ReadonlySet<string>,
): number {
  return lines.reduce((sum, line) => {
    const priceId = line.price?.id?.trim();
    if (!priceId || !planPriceIds.has(priceId)) {
      return sum;
    }
    return sum + (typeof line.amount === 'number' ? line.amount : 0);
  }, 0);
}

export function collectPlanPriceIds(priceMap: {
  SOLO: string[];
  PRO: string[];
  ELITE: string[];
}): Set<string> {
  return new Set([...priceMap.SOLO, ...priceMap.PRO, ...priceMap.ELITE]);
}
