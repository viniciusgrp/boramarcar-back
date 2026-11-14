import { BadRequestException } from '@nestjs/common';
import { normalizeAsaasCpfCnpj } from './asaas-document.util';

describe('normalizeAsaasCpfCnpj', () => {
  it('keeps 11 or 14 digits', () => {
    expect(normalizeAsaasCpfCnpj('123.456.789-01')).toBe('12345678901');
    expect(normalizeAsaasCpfCnpj('12.345.678/0001-90')).toBe('12345678000190');
  });

  it('rejects missing or incomplete documents', () => {
    expect(() => normalizeAsaasCpfCnpj('')).toThrow(BadRequestException);
    expect(() => normalizeAsaasCpfCnpj('123')).toThrow(BadRequestException);
  });
});
