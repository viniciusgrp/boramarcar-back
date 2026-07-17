import { BadRequestException } from '@nestjs/common';
import { resolveProfessionalIdForRole } from './resolve-professional-id-for-role.util';

describe('resolveProfessionalIdForRole', () => {
  const professionalId = '11111111-1111-1111-1111-111111111111';

  it('requires a professional id for PROFESSIONAL', () => {
    expect(() => resolveProfessionalIdForRole('PROFESSIONAL', null)).toThrow(
      BadRequestException,
    );
    expect(() => resolveProfessionalIdForRole('PROFESSIONAL', '  ')).toThrow(
      BadRequestException,
    );
  });

  it('returns the professional id for PROFESSIONAL', () => {
    expect(resolveProfessionalIdForRole('PROFESSIONAL', professionalId)).toBe(
      professionalId,
    );
  });

  it('allows ADMIN without a professional link', () => {
    expect(resolveProfessionalIdForRole('ADMIN', null)).toBeNull();
    expect(resolveProfessionalIdForRole('ADMIN', undefined)).toBeNull();
    expect(resolveProfessionalIdForRole('ADMIN', '  ')).toBeNull();
  });

  it('links a professional for ADMIN when provided', () => {
    expect(resolveProfessionalIdForRole('ADMIN', professionalId)).toBe(
      professionalId,
    );
    expect(
      resolveProfessionalIdForRole('ADMIN', `  ${professionalId}  `),
    ).toBe(professionalId);
  });

  it('never links via this helper for OWNER', () => {
    expect(resolveProfessionalIdForRole('OWNER', professionalId)).toBeNull();
  });
});
