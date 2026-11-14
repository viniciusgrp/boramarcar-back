import { isValidAsaasWebhookToken } from './asaas-webhook-auth.util';

describe('asaas-webhook-auth.util', () => {
  it('accepts matching tokens', () => {
    expect(isValidAsaasWebhookToken('secret-token', 'secret-token')).toBe(true);
  });

  it('rejects missing or different tokens', () => {
    expect(isValidAsaasWebhookToken(undefined, 'secret-token')).toBe(false);
    expect(isValidAsaasWebhookToken('other', 'secret-token')).toBe(false);
    expect(isValidAsaasWebhookToken('secret-token', undefined)).toBe(false);
  });
});
