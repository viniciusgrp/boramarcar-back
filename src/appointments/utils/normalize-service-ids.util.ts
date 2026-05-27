export function normalizeServiceIds(input: {
  serviceId?: string;
  serviceIds?: string[];
}): string[] {
  const fromArray = (input.serviceIds ?? [])
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id));

  if (fromArray.length > 0) {
    return [...new Set(fromArray)];
  }

  const single = input.serviceId?.trim();
  return single ? [single] : [];
}
