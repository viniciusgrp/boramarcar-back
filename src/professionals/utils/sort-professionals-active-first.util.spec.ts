import {
  compareProfessionalsActiveFirst,
  sortProfessionalsActiveFirst,
} from './sort-professionals-active-first.util';

describe('compareProfessionalsActiveFirst', () => {
  it('places active professionals before inactive ones', () => {
    expect(
      compareProfessionalsActiveFirst(
        { is_active: true, name: 'Zé' },
        { is_active: false, name: 'Ana' },
      ),
    ).toBeLessThan(0);
    expect(
      compareProfessionalsActiveFirst(
        { is_active: false, name: 'Ana' },
        { is_active: true, name: 'Zé' },
      ),
    ).toBeGreaterThan(0);
  });

  it('sorts by name when both share the same active status', () => {
    expect(
      compareProfessionalsActiveFirst(
        { is_active: true, name: 'Bruno' },
        { is_active: true, name: 'Ana' },
      ),
    ).toBeGreaterThan(0);
  });
});

describe('sortProfessionalsActiveFirst', () => {
  it('returns active professionals first, then alphabetical names', () => {
    const sorted = sortProfessionalsActiveFirst([
      { is_active: false, name: 'Ana' },
      { is_active: true, name: 'Carlos' },
      { is_active: true, name: 'Bruno' },
      { is_active: false, name: 'Diana' },
    ]);

    expect(sorted.map((item) => item.name)).toEqual([
      'Bruno',
      'Carlos',
      'Ana',
      'Diana',
    ]);
  });

  it('does not mutate the original array', () => {
    const original = [
      { is_active: false, name: 'Ana' },
      { is_active: true, name: 'Bruno' },
    ];

    sortProfessionalsActiveFirst(original);

    expect(original.map((item) => item.name)).toEqual(['Ana', 'Bruno']);
  });
});
