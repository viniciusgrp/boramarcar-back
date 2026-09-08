import {
  isValidSlug,
  normalizeSlug,
  resolveSlugForUpdate,
} from './slug.util';

describe('slug.util', () => {
  it('normalizes names into kebab-case slugs', () => {
    expect(normalizeSlug(' Barbearia do Zé ')).toBe('barbearia-do-ze');
    expect(isValidSlug('barbearia-do-ze')).toBe(true);
    expect(isValidSlug('Barbe')).toBe(false);
  });

  it('keeps the current slug when the value is unchanged', () => {
    expect(resolveSlugForUpdate('studio', 'Studio')).toBe('studio');
  });
});
