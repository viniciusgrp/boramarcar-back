export interface ConsumableLot {
  id: string;
  expiryDate: string | null;
  receivedAt: string;
  quantityRemaining: number;
  unitCost: number;
}

export interface LotConsumption {
  lotId: string;
  quantity: number;
  unitCost: number;
}

export interface FefoConsumptionResult {
  consumptions: LotConsumption[];
  /** Quantidade que não pôde ser consumida por falta de saldo nos lotes. */
  shortfall: number;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Seleciona lotes para baixa de estoque seguindo FEFO (First-Expired-First-Out):
 * lotes com validade mais próxima saem primeiro; lotes sem validade são
 * consumidos por último, em ordem FIFO (mais antigos primeiro).
 */
export function selectLotsForConsumptionFefo(
  lots: ConsumableLot[],
  quantityNeeded: number,
): FefoConsumptionResult {
  const sortedLots = [...lots]
    .filter((lot) => lot.quantityRemaining > 0)
    .sort((a, b) => {
      if (a.expiryDate && b.expiryDate) {
        return a.expiryDate.localeCompare(b.expiryDate);
      }

      if (a.expiryDate && !b.expiryDate) {
        return -1;
      }

      if (!a.expiryDate && b.expiryDate) {
        return 1;
      }

      return a.receivedAt.localeCompare(b.receivedAt);
    });

  const consumptions: LotConsumption[] = [];
  let remaining = roundQuantity(quantityNeeded);

  for (const lot of sortedLots) {
    if (remaining <= 0) {
      break;
    }

    const take = roundQuantity(Math.min(lot.quantityRemaining, remaining));

    if (take <= 0) {
      continue;
    }

    consumptions.push({ lotId: lot.id, quantity: take, unitCost: lot.unitCost });
    remaining = roundQuantity(remaining - take);
  }

  return { consumptions, shortfall: Math.max(0, remaining) };
}
