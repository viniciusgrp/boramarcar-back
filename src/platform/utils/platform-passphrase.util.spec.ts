import { passphraseMatches } from './platform-passphrase.util';

describe('passphraseMatches', () => {
  it('accepts the expected passphrase', () => {
    expect(passphraseMatches('secret-word', 'secret-word')).toBe(true);
  });

  it('rejects a different passphrase', () => {
    expect(passphraseMatches('nope', 'secret-word')).toBe(false);
  });

  it('rejects when expected is empty', () => {
    expect(passphraseMatches('secret-word', '')).toBe(false);
    expect(passphraseMatches('secret-word', undefined)).toBe(false);
  });
});
