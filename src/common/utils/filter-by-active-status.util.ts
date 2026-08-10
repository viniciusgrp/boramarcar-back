export type ActiveInactiveListStatus = 'active' | 'inactive';

/** Filter catalog rows by soft-active flag for Ativos / Inativos list tabs. */
export function filterByActiveStatus<T extends { is_active: boolean }>(
  items: readonly T[],
  status: ActiveInactiveListStatus,
): T[] {
  return items.filter((item) =>
    status === 'active' ? item.is_active : !item.is_active,
  );
}
