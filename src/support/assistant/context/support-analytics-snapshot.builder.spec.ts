import {
  assertSupportAnalyticsSnapshotHasNoForbiddenFields,
  buildEmptySupportAnalyticsSnapshot,
  buildSupportAnalyticsQueryFilters,
  buildSupportAnalyticsSnapshot,
  extractAnalyticsDateKey,
  extractAnalyticsWeekdayIndex,
  serializeSupportAnalyticsSnapshot,
  type SupportAnalyticsAppointmentRow,
  type SupportAnalyticsSnapshot,
} from './support-analytics-snapshot.builder';

const now = new Date('2026-07-17T15:00:00.000Z');

function row(
  partial: Partial<SupportAnalyticsAppointmentRow> &
    Pick<SupportAnalyticsAppointmentRow, 'start_time' | 'status'>,
): SupportAnalyticsAppointmentRow {
  return {
    total_price: 100,
    professional_id: 'pro-a',
    professional_name: 'Ana',
    service_name: 'Corte',
    ...partial,
  };
}

describe('support-analytics-snapshot.builder', () => {
  it('extracts date key and weekday from start_time', () => {
    // 2026-07-17 was a Friday (5)
    expect(extractAnalyticsDateKey('2026-07-17T14:30:00')).toBe('2026-07-17');
    expect(extractAnalyticsWeekdayIndex('2026-07-17T14:30:00')).toBe(5);
  });

  it('requires tenant_id and professional_id for self scope filters', () => {
    expect(() =>
      buildSupportAnalyticsQueryFilters({
        tenantId: '',
        dataScope: 'tenant',
        professionalId: null,
      }),
    ).toThrow(/tenant_id/);

    expect(() =>
      buildSupportAnalyticsQueryFilters({
        tenantId: 'tenant-1',
        dataScope: 'self',
        professionalId: null,
      }),
    ).toThrow(/professional_id/);

    expect(
      buildSupportAnalyticsQueryFilters({
        tenantId: 'tenant-1',
        dataScope: 'self',
        professionalId: 'pro-a',
      }),
    ).toEqual({
      tenantId: 'tenant-1',
      professionalId: 'pro-a',
      requiresProfessionalFilter: true,
    });

    expect(
      buildSupportAnalyticsQueryFilters({
        tenantId: 'tenant-1',
        dataScope: 'tenant',
        professionalId: 'ignored',
      }),
    ).toEqual({
      tenantId: 'tenant-1',
      professionalId: null,
      requiresProfessionalFilter: false,
    });
  });

  it('aggregates revenue by weekday and answers peak day', () => {
    const snapshot = buildSupportAnalyticsSnapshot({
      now,
      dataScope: 'tenant',
      rows: [
        row({ start_time: '2026-07-17T10:00:00', status: 'COMPLETED', total_price: 50 }), // Fri
        row({ start_time: '2026-07-17T11:00:00', status: 'COMPLETED', total_price: 50 }), // Fri
        row({ start_time: '2026-07-16T10:00:00', status: 'COMPLETED', total_price: 80 }), // Thu
        row({ start_time: '2026-07-15T10:00:00', status: 'CANCELLED', total_price: 999 }),
      ],
    });

    expect(snapshot.totals.completedCount).toBe(3);
    expect(snapshot.totals.revenue).toBe(180);
    expect(snapshot.byStatusCounts.COMPLETED).toBe(3);
    expect(snapshot.byStatusCounts.CANCELLED).toBe(1);

    const friday = snapshot.revenueByWeekday.find((item) => item.weekdayIndex === 5);
    const thursday = snapshot.revenueByWeekday.find((item) => item.weekdayIndex === 4);
    expect(friday?.revenue).toBe(100);
    expect(thursday?.revenue).toBe(80);

    const peak = [...snapshot.revenueByWeekday].sort(
      (left, right) => right.revenue - left.revenue,
    )[0];
    expect(peak.weekdayLabel).toBe('Sexta');
  });

  it('includes byProfessional only for tenant scope', () => {
    const tenantSnapshot = buildSupportAnalyticsSnapshot({
      now,
      dataScope: 'tenant',
      rows: [
        row({
          start_time: '2026-07-17T10:00:00',
          status: 'COMPLETED',
          professional_id: 'pro-a',
          professional_name: 'Ana',
          total_price: 100,
        }),
        row({
          start_time: '2026-07-17T11:00:00',
          status: 'COMPLETED',
          professional_id: 'pro-b',
          professional_name: 'Bruno',
          total_price: 200,
        }),
      ],
    });

    expect(tenantSnapshot.byProfessional).toHaveLength(2);
    expect(tenantSnapshot.byProfessional?.[0].name).toBe('Bruno');
    expect(tenantSnapshot.byProfessional?.[0].revenue).toBe(200);

    const selfSnapshot = buildSupportAnalyticsSnapshot({
      now,
      dataScope: 'self',
      rows: [
        row({
          start_time: '2026-07-17T10:00:00',
          status: 'COMPLETED',
          professional_id: 'pro-a',
          professional_name: 'Ana',
          total_price: 100,
        }),
      ],
    });

    expect(selfSnapshot.byProfessional).toBeUndefined();
    expect(selfSnapshot.dataScope).toBe('self');
  });

  it('self-scoped aggregation only reflects provided rows (professional A vs B isolation)', () => {
    const rowsProA: SupportAnalyticsAppointmentRow[] = [
      row({
        start_time: '2026-07-17T10:00:00',
        status: 'COMPLETED',
        professional_id: 'pro-a',
        professional_name: 'Ana',
        total_price: 100,
      }),
    ];

    const snapshotA = buildSupportAnalyticsSnapshot({
      now,
      dataScope: 'self',
      rows: rowsProA,
    });

    expect(snapshotA.totals.revenue).toBe(100);
    expect(JSON.stringify(snapshotA)).not.toContain('Bruno');
    expect(JSON.stringify(snapshotA)).not.toContain('pro-b');
  });

  it('empty professional_not_linked snapshot has no byProfessional leakage for self', () => {
    const snapshot = buildEmptySupportAnalyticsSnapshot({
      dataScope: 'self',
      emptyReason: 'professional_not_linked',
      now,
    });
    expect(snapshot.emptyReason).toBe('professional_not_linked');
    expect(snapshot.byProfessional).toBeUndefined();
    expect(() =>
      assertSupportAnalyticsSnapshotHasNoForbiddenFields(snapshot),
    ).not.toThrow();
  });

  it('rejects forbidden PII fields in serialized analytics', () => {
    const snapshot = buildSupportAnalyticsSnapshot({
      now,
      dataScope: 'tenant',
      rows: [
        row({ start_time: '2026-07-17T10:00:00', status: 'COMPLETED' }),
      ],
    });

    expect(() =>
      assertSupportAnalyticsSnapshotHasNoForbiddenFields(snapshot),
    ).not.toThrow();

    const poisoned = {
      ...snapshot,
      leak: { customer_email: 'a@b.com' },
    } as unknown as SupportAnalyticsSnapshot;

    expect(() =>
      assertSupportAnalyticsSnapshotHasNoForbiddenFields(poisoned),
    ).toThrow(/proibido/);

    const selfWithPros = {
      ...buildSupportAnalyticsSnapshot({
        now,
        dataScope: 'self',
        rows: [],
      }),
      byProfessional: [{ name: 'Outro', revenue: 1, completedCount: 1 }],
    } as SupportAnalyticsSnapshot;

    expect(() =>
      assertSupportAnalyticsSnapshotHasNoForbiddenFields(selfWithPros),
    ).toThrow(/byProfessional/);
  });

  it('serialize produces valid JSON without customer PII keys', () => {
    const snapshot = buildSupportAnalyticsSnapshot({
      now,
      dataScope: 'tenant',
      rows: [
        row({
          start_time: '2026-07-17T10:00:00',
          status: 'COMPLETED',
          service_name: 'Barba',
        }),
      ],
    });
    const serialized = serializeSupportAnalyticsSnapshot(snapshot);
    expect(serialized).toContain('Barba');
    expect(serialized.toLowerCase()).not.toContain('customer_');
    expect(serialized.toLowerCase()).not.toContain('stripe_');
  });
});
