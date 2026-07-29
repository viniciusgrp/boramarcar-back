export interface ServiceBomLine {
  serviceId: string;
  productId: string;
  quantity: number;
}

export interface AggregatedBomQuantity {
  productId: string;
  quantity: number;
}

/**
 * Soma quantidades de BOM por produto a partir das linhas da ficha técnica
 * dos serviços do atendimento (mesmo produto em vários serviços soma).
 */
export function aggregateBomQuantitiesByProduct(
  lines: ServiceBomLine[],
): AggregatedBomQuantity[] {
  const totals = new Map<string, number>();

  for (const line of lines) {
    const productId = line.productId?.trim();
    const quantity = Number(line.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      continue;
    }

    totals.set(productId, (totals.get(productId) ?? 0) + quantity);
  }

  return [...totals.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

/** Extrai service_ids de um atendimento (junction + fallback no service_id legado). */
export function resolveAppointmentServiceIds(params: {
  appointmentServices?: Array<{ service_id?: string | null }> | null;
  primaryServiceId?: string | null;
}): string[] {
  const fromJunction = (params.appointmentServices ?? [])
    .map((item) => item.service_id?.trim() || '')
    .filter(Boolean);

  if (fromJunction.length > 0) {
    return [...new Set(fromJunction)];
  }

  const primary = params.primaryServiceId?.trim();
  return primary ? [primary] : [];
}
