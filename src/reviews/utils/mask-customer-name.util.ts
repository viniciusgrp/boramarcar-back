export function maskCustomerFirstName(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim() ?? '';

  if (!trimmed) {
    return 'Cliente';
  }

  const first = trimmed.split(/\s+/)[0];
  return first || 'Cliente';
}
