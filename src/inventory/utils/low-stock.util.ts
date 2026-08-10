export function isProductLowStock(
  currentStock: number,
  minStockAlert: number,
): boolean {
  return minStockAlert > 0 && currentStock <= minStockAlert;
}

export function calculateProductMarginPercent(
  costPrice: number,
  salePrice: number,
): number | null {
  if (!Number.isFinite(costPrice) || !Number.isFinite(salePrice)) {
    return null;
  }

  if (costPrice <= 0) {
    return null;
  }

  return Math.round(((salePrice - costPrice) / costPrice) * 100 * 100) / 100;
}
