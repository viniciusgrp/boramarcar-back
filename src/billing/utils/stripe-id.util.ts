export function extractStripeId(
  value: string | { id: string } | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return value.id;
}
