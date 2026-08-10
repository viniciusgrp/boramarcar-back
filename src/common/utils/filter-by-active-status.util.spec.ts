import { filterByActiveStatus } from './filter-by-active-status.util';

describe('filterByActiveStatus', () => {
  const items = [
    { id: '1', is_active: true, name: 'A' },
    { id: '2', is_active: false, name: 'B' },
    { id: '3', is_active: true, name: 'C' },
  ];

  it('returns only active items for active status', () => {
    expect(filterByActiveStatus(items, 'active')).toEqual([
      { id: '1', is_active: true, name: 'A' },
      { id: '3', is_active: true, name: 'C' },
    ]);
  });

  it('returns only inactive items for inactive status', () => {
    expect(filterByActiveStatus(items, 'inactive')).toEqual([
      { id: '2', is_active: false, name: 'B' },
    ]);
  });

  it('returns empty array when no items match', () => {
    expect(filterByActiveStatus([], 'active')).toEqual([]);
    expect(
      filterByActiveStatus([{ id: '1', is_active: true }], 'inactive'),
    ).toEqual([]);
  });
});
