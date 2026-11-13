import { BadRequestException } from '@nestjs/common';

export function normalizeAsaasCpfCnpj(value: string | null | undefined): string {
  const digits = value?.replace(/\D/g, '') ?? '';

  if (digits.length !== 11 && digits.length !== 14) {
    throw new BadRequestException('Informe um CPF ou CNPJ válido.');
  }

  return digits;
}
