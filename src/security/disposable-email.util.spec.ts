import {
  extractEmailDomain,
  isDisposableEmail,
  isDisposableEmailDomain,
} from './disposable-email.util';

describe('disposable-email.util', () => {
  it('extracts a normalized domain', () => {
    expect(extractEmailDomain('  Dono@Mailinator.COM ')).toBe('mailinator.com');
  });

  it('returns null for malformed addresses', () => {
    expect(extractEmailDomain('sem-arroba')).toBeNull();
    expect(extractEmailDomain('@sem-local.com')).toBeNull();
    expect(extractEmailDomain('local@')).toBeNull();
  });

  it('rejects well-known disposable domains and subdomains', () => {
    expect(isDisposableEmail('pentest@mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@yopmail.com')).toBe(true);
    expect(isDisposableEmail('a@guerrillamail.com')).toBe(true);
    expect(isDisposableEmail('a@10minutemail.com')).toBe(true);
    expect(isDisposableEmailDomain('mail.guerrillamail.com')).toBe(true);
  });

  it('accepts durable consumer and custom domains', () => {
    expect(isDisposableEmail('dono@gmail.com')).toBe(false);
    expect(isDisposableEmail('dono@outlook.com')).toBe(false);
    expect(isDisposableEmail('contato@minhaempresa.com.br')).toBe(false);
  });
});
