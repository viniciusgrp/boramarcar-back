import { sanitizeSupportUserInput } from './support-input-sanitizer.util';

describe('sanitizeSupportUserInput', () => {
  it('blocks empty messages', () => {
    const result = sanitizeSupportUserInput('   ', 2000);
    expect(result.blocked).toBe(true);
  });

  it('blocks messages above max length', () => {
    const result = sanitizeSupportUserInput('a'.repeat(10), 5);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('5');
  });

  it('blocks obvious secret dumps', () => {
    const result = sanitizeSupportUserInput('minha chave sk_test_abc123xyz', 2000);
    expect(result.blocked).toBe(true);
  });

  it('sanitizes valid messages', () => {
    const result = sanitizeSupportUserInput('  Como   configurar   horários?  ', 2000);
    expect(result).toEqual({
      sanitized: 'Como configurar horários?',
      blocked: false,
    });
  });
});
