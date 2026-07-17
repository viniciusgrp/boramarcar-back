type SortableProfessional = {
  is_active: boolean;
  name: string;
};

/** Active professionals first, then alphabetical by name (pt-BR). */
export function compareProfessionalsActiveFirst(
  a: SortableProfessional,
  b: SortableProfessional,
): number {
  if (a.is_active !== b.is_active) {
    return a.is_active ? -1 : 1;
  }

  return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
}

export function sortProfessionalsActiveFirst<T extends SortableProfessional>(
  professionals: T[],
): T[] {
  return [...professionals].sort(compareProfessionalsActiveFirst);
}
