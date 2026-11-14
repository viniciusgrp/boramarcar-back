import {
  decryptAsaasSubaccountApiKey,
  encryptAsaasSubaccountApiKey,
} from './asaas-subaccount-key.util';

describe('asaas-subaccount-key.util', () => {
  const secret = 'test-subaccount-encryption-secret';
  const apiKey = '$aact_hmlg_subaccount_key_do_not_log';

  it('round-trips the api key and does not store it in plaintext', () => {
    const encrypted = encryptAsaasSubaccountApiKey(apiKey, secret);
    const again = encryptAsaasSubaccountApiKey(apiKey, secret);

    expect(encrypted).not.toContain(apiKey);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(encrypted).not.toBe(again);
    expect(decryptAsaasSubaccountApiKey(encrypted, secret)).toBe(apiKey);
  });

  it('rejects a different secret or a tampered payload', () => {
    const encrypted = encryptAsaasSubaccountApiKey(apiKey, secret);

    expect(() =>
      decryptAsaasSubaccountApiKey(encrypted, 'other-secret'),
    ).toThrow();
    expect(() => decryptAsaasSubaccountApiKey('not-encrypted', secret)).toThrow(
      /Invalid encrypted/,
    );
  });
});
