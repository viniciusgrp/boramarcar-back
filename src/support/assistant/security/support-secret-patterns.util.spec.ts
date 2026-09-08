import { containsBlockedSecretDump, redactSecrets } from './support-secret-patterns.util';

describe('support-secret-patterns.util', () => {
  it('detects and redacts Stripe secret keys', () => {
    const text = 'key sk_test_abc123XYZ';
    expect(containsBlockedSecretDump(text)).toBe(true);
    expect(redactSecrets(text)).toContain('[redigido]');
  });
});
