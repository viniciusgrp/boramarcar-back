import {
  formatAppointmentWallClockDateTime,
  resolveCustomerFirstName,
} from './format-appointment-wall-clock.util';

describe('formatAppointmentWallClockDateTime', () => {
  it('formats wall-clock UTC digits without shifting to America/Sao_Paulo', () => {
    // T14:00Z must stay 14h at the shop (not 11h BRT)
    expect(formatAppointmentWallClockDateTime('2026-11-20T14:00:00.000Z')).toBe(
      'sexta, 20/11, às 14h',
    );
  });

  it('includes minutes only when non-zero', () => {
    expect(formatAppointmentWallClockDateTime('2026-11-20T14:30:00.000Z')).toBe(
      'sexta, 20/11, às 14h30',
    );
  });

  it('returns null for invalid input', () => {
    expect(formatAppointmentWallClockDateTime('')).toBeNull();
    expect(formatAppointmentWallClockDateTime('not-a-date')).toBeNull();
  });
});

describe('resolveCustomerFirstName', () => {
  it('uses the first name and falls back to Um cliente', () => {
    expect(resolveCustomerFirstName('Carla Souza')).toBe('Carla');
    expect(resolveCustomerFirstName('  ')).toBe('Um cliente');
    expect(resolveCustomerFirstName(null)).toBe('Um cliente');
  });
});
