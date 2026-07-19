import {
  buildAbsenceRangeIso,
  extractSupportActionPropose,
  sanitizeSupportActionPayload,
} from './support-action-sanitize.util';

describe('support-action-sanitize', () => {
  it('accepts create_absence allDay payload', () => {
    const payload = sanitizeSupportActionPayload(
      'create_absence',
      '{"date":"2026-07-18","allDay":true,"reason":"Folga"}',
    );
    expect(payload).toEqual({
      date: '2026-07-18',
      allDay: true,
      reason: 'Folga',
    });
    expect(buildAbsenceRangeIso(payload as { date: string; allDay?: boolean })).toEqual({
      startsAt: '2026-07-18T00:00:00.000Z',
      endsAt: '2026-07-18T23:59:59.000Z',
    });
  });

  it('builds partial-day absence as wall-clock UTC storage', () => {
    const payload = sanitizeSupportActionPayload(
      'create_absence',
      '{"date":"2026-07-18","startTime":"08:00","endTime":"12:00"}',
    );
    expect(
      buildAbsenceRangeIso(
        payload as {
          date: string;
          startTime: string;
          endTime: string;
        },
      ),
    ).toEqual({
      startsAt: '2026-07-18T08:00:00.000Z',
      endsAt: '2026-07-18T12:00:00.000Z',
    });
  });

  it('rejects invalid dates and unknown action JSON', () => {
    expect(
      sanitizeSupportActionPayload('create_absence', '{"date":"18/07/2026"}'),
    ).toBeNull();
    expect(
      sanitizeSupportActionPayload('cancel_appointment', '{"foo":1}'),
    ).toBeNull();
  });

  it('extracts one valid ACTION_PROPOSE and strips markers', () => {
    const result = extractSupportActionPropose(
      'Vou registrar.\n[ACTION_PROPOSE:create_absence|{"date":"2026-07-18","allDay":true}]\n[ACTION_PROPOSE:create_absence|{"date":"bad"}]',
    );
    expect(result.action?.type).toBe('create_absence');
    expect(result.displayContent).toContain('Vou registrar.');
    expect(result.displayContent).not.toContain('ACTION_PROPOSE');
    expect(result.removedInvalid).toBeGreaterThan(0);
  });

  it('strips external-looking cancel payloads without date/id', () => {
    const result = extractSupportActionPropose(
      '[ACTION_PROPOSE:cancel_appointment|{"appointmentId":"not-a-uuid"}]',
    );
    expect(result.action).toBeNull();
  });

  it('accepts cancel_appointment with date and time', () => {
    const payload = sanitizeSupportActionPayload(
      'cancel_appointment',
      '{"date":"2026-07-18","time":"15:00","customerNameHint":"João"}',
    );
    expect(payload).toEqual({
      date: '2026-07-18',
      time: '15:00',
      customerNameHint: 'João',
    });
  });

  it('accepts delete_absence payload and extracts marker', () => {
    const payload = sanitizeSupportActionPayload(
      'delete_absence',
      '{"date":"2026-07-18","startTime":"08:00","endTime":"12:00"}',
    );
    expect(payload).toEqual({
      date: '2026-07-18',
      startTime: '08:00',
      endTime: '12:00',
    });

    const extracted = extractSupportActionPropose(
      'Removendo.\n[ACTION_PROPOSE:delete_absence|{"date":"2026-07-18","allDay":true}]',
    );
    expect(extracted.action?.type).toBe('delete_absence');
    expect(extracted.displayContent).toContain('Removendo.');
  });
});
