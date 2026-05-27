export function parseServiceIdsQuery(
  serviceId?: string,
  serviceIds?: string | string[],
): string[] {
  const collected: string[] = [];

  if (serviceId?.trim()) {
    collected.push(serviceId.trim());
  }

  if (Array.isArray(serviceIds)) {
    for (const id of serviceIds) {
      if (id?.trim()) {
        collected.push(id.trim());
      }
    }
  } else if (typeof serviceIds === 'string' && serviceIds.trim()) {
    for (const part of serviceIds.split(',')) {
      const trimmed = part.trim();
      if (trimmed) {
        collected.push(trimmed);
      }
    }
  }

  return [...new Set(collected)];
}
