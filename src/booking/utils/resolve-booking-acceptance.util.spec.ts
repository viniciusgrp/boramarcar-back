import { resolveEffectiveBookingAcceptance } from './resolve-booking-acceptance.util';

describe('resolve-booking-acceptance.util', () => {
  it('uses the tenant default when the professional has DEFAULT', () => {
    expect(resolveEffectiveBookingAcceptance('AUTOMATIC', 'DEFAULT')).toBe(
      'AUTOMATIC',
    );
    expect(resolveEffectiveBookingAcceptance('MANUAL', 'DEFAULT')).toBe('MANUAL');
  });

  it('lets the professional override the tenant setting', () => {
    expect(resolveEffectiveBookingAcceptance('AUTOMATIC', 'MANUAL')).toBe(
      'MANUAL',
    );
    expect(resolveEffectiveBookingAcceptance('MANUAL', 'AUTOMATIC')).toBe(
      'AUTOMATIC',
    );
  });
});
