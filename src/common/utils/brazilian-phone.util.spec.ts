import {
  extractBrazilianPhoneDigits,
  isValidBrazilianPhone,
} from './brazilian-phone.util';

describe('brazilian-phone.util', () => {
  it('extracts national digits and strips 55', () => {
    expect(extractBrazilianPhoneDigits('(11) 98888-7777')).toBe('11988887777');
    expect(extractBrazilianPhoneDigits('5511988887777')).toBe('11988887777');
  });

  it('validates landline and mobile formats', () => {
    expect(isValidBrazilianPhone('1133334444')).toBe(true);
    expect(isValidBrazilianPhone('11988887777')).toBe(true);
    expect(isValidBrazilianPhone('1188887777')).toBe(true);
    expect(isValidBrazilianPhone('11888877777')).toBe(false);
    expect(isValidBrazilianPhone('123')).toBe(false);
    expect(isValidBrazilianPhone('abc', { required: true })).toBe(false);
  });

  it('treats empty as valid only when optional', () => {
    expect(isValidBrazilianPhone('')).toBe(true);
    expect(isValidBrazilianPhone('', { required: true })).toBe(false);
  });
});
