import {
  normalizeProfessionalPhoneDigits,
  professionalPhonesMatch,
} from './professional-phone-match.util';

describe('normalizeProfessionalPhoneDigits', () => {
  it('strips non-digit characters', () => {
    expect(normalizeProfessionalPhoneDigits('(11) 98888-7777')).toBe(
      '11988887777',
    );
  });

  it('returns empty string for nullish values', () => {
    expect(normalizeProfessionalPhoneDigits(null)).toBe('');
    expect(normalizeProfessionalPhoneDigits(undefined)).toBe('');
  });
});

describe('professionalPhonesMatch', () => {
  it('matches equivalent formatted phones', () => {
    expect(
      professionalPhonesMatch('(11) 98888-7777', '11988887777'),
    ).toBe(true);
  });

  it('does not match different phones', () => {
    expect(
      professionalPhonesMatch('(11) 98888-7777', '(11) 98888-6666'),
    ).toBe(false);
  });

  it('does not match when either side is empty', () => {
    expect(professionalPhonesMatch('', '11988887777')).toBe(false);
    expect(professionalPhonesMatch('(11) 98888-7777', null)).toBe(false);
  });
});
