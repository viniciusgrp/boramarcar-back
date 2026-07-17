export type SupportAnalyticsDataScope = 'tenant' | 'self';

export interface SupportAnalyticsTotals {
  completedCount: number;
  revenue: number;
  averageTicket: number;
}

export interface SupportAnalyticsWeekdayPoint {
  weekdayIndex: number;
  weekdayLabel: string;
  revenue: number;
  completedCount: number;
}

export interface SupportAnalyticsDayPoint {
  date: string;
  revenue: number;
  completedCount: number;
}

export interface SupportAnalyticsServicePoint {
  name: string;
  revenue: number;
  completedCount: number;
}

export interface SupportAnalyticsProfessionalPoint {
  name: string;
  revenue: number;
  completedCount: number;
}

export interface SupportAnalyticsSnapshot {
  generatedAt: string;
  periodFrom: string;
  periodTo: string;
  dataScope: SupportAnalyticsDataScope;
  currency: 'BRL';
  emptyReason: 'none' | 'professional_not_linked' | 'no_data';
  totals: SupportAnalyticsTotals;
  revenueByWeekday: SupportAnalyticsWeekdayPoint[];
  /** Dias com receita, ordenados por receita desc (máx. 14) para perguntas de pico. */
  topRevenueDays: SupportAnalyticsDayPoint[];
  topServices: SupportAnalyticsServicePoint[];
  byStatusCounts: Record<string, number>;
  byProfessional?: SupportAnalyticsProfessionalPoint[];
}

/** Linha mínima para agregação (sem PII de cliente). */
export interface SupportAnalyticsAppointmentRow {
  start_time: string;
  status: string;
  total_price: number | string | null;
  professional_id: string | null;
  professional_name: string | null;
  service_name: string | null;
}

export const SUPPORT_ANALYTICS_PERIOD_DAYS = 90;
export const SUPPORT_ANALYTICS_TOP_SERVICES = 5;
export const SUPPORT_ANALYTICS_TOP_DAYS = 14;
export const SUPPORT_ANALYTICS_TOP_PROFESSIONALS = 10;

const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

const FORBIDDEN_ANALYTICS_SUBSTRINGS = [
  'stripe_customer',
  'stripe_account',
  'contact_email',
  'customer_email',
  'customer_phone',
  'customer_name',
  'password',
  'secret',
  'api_key',
  'phone',
  'email',
] as const;

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function parsePrice(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Extrai yyyy-MM-dd do start_time sem depender de timezone do servidor. */
export function extractAnalyticsDateKey(startTime: string): string {
  const match = startTime.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    return match[1];
  }
  return startTime.slice(0, 10);
}

export function extractAnalyticsWeekdayIndex(startTime: string): number {
  const dateKey = extractAnalyticsDateKey(startTime);
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) {
    return 0;
  }
  // Meio-dia UTC evita edge de DST ao derivar weekday do calendário local do horário.
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

export function resolveSupportAnalyticsPeriod(now = new Date()): {
  periodFrom: string;
  periodTo: string;
  periodFromIso: string;
  periodToIso: string;
} {
  const periodTo = new Date(now);
  const periodFrom = new Date(now);
  periodFrom.setUTCDate(periodFrom.getUTCDate() - (SUPPORT_ANALYTICS_PERIOD_DAYS - 1));

  const toKey = periodTo.toISOString().slice(0, 10);
  const fromKey = periodFrom.toISOString().slice(0, 10);

  return {
    periodFrom: fromKey,
    periodTo: toKey,
    periodFromIso: `${fromKey}T00:00:00.000Z`,
    periodToIso: `${toKey}T23:59:59.999Z`,
  };
}

export function buildEmptySupportAnalyticsSnapshot(params: {
  dataScope: SupportAnalyticsDataScope;
  emptyReason: SupportAnalyticsSnapshot['emptyReason'];
  now?: Date;
}): SupportAnalyticsSnapshot {
  const period = resolveSupportAnalyticsPeriod(params.now);
  const revenueByWeekday: SupportAnalyticsWeekdayPoint[] = WEEKDAY_LABELS.map(
    (label, weekdayIndex) => ({
      weekdayIndex,
      weekdayLabel: label,
      revenue: 0,
      completedCount: 0,
    }),
  );

  return {
    generatedAt: (params.now ?? new Date()).toISOString(),
    periodFrom: period.periodFrom,
    periodTo: period.periodTo,
    dataScope: params.dataScope,
    currency: 'BRL',
    emptyReason: params.emptyReason,
    totals: {
      completedCount: 0,
      revenue: 0,
      averageTicket: 0,
    },
    revenueByWeekday,
    topRevenueDays: [],
    topServices: [],
    byStatusCounts: {},
    ...(params.dataScope === 'tenant' ? { byProfessional: [] } : {}),
  };
}

export function buildSupportAnalyticsSnapshot(params: {
  rows: SupportAnalyticsAppointmentRow[];
  dataScope: SupportAnalyticsDataScope;
  now?: Date;
}): SupportAnalyticsSnapshot {
  const period = resolveSupportAnalyticsPeriod(params.now);
  const byStatusCounts: Record<string, number> = {};
  const weekdayMap = new Map<number, { revenue: number; completedCount: number }>();
  const dayMap = new Map<string, { revenue: number; completedCount: number }>();
  const serviceMap = new Map<string, { revenue: number; completedCount: number }>();
  const professionalMap = new Map<
    string,
    { name: string; revenue: number; completedCount: number }
  >();

  for (let index = 0; index < 7; index += 1) {
    weekdayMap.set(index, { revenue: 0, completedCount: 0 });
  }

  let completedCount = 0;
  let revenue = 0;

  for (const row of params.rows) {
    const status = (row.status || 'UNKNOWN').toUpperCase();
    byStatusCounts[status] = (byStatusCounts[status] ?? 0) + 1;

    if (status !== 'COMPLETED') {
      continue;
    }

    const price = parsePrice(row.total_price);
    completedCount += 1;
    revenue += price;

    const weekdayIndex = extractAnalyticsWeekdayIndex(row.start_time);
    const weekday = weekdayMap.get(weekdayIndex) ?? {
      revenue: 0,
      completedCount: 0,
    };
    weekday.revenue += price;
    weekday.completedCount += 1;
    weekdayMap.set(weekdayIndex, weekday);

    const dateKey = extractAnalyticsDateKey(row.start_time);
    const day = dayMap.get(dateKey) ?? { revenue: 0, completedCount: 0 };
    day.revenue += price;
    day.completedCount += 1;
    dayMap.set(dateKey, day);

    const serviceName = (row.service_name ?? '').trim() || 'Serviço';
    const service = serviceMap.get(serviceName) ?? {
      revenue: 0,
      completedCount: 0,
    };
    service.revenue += price;
    service.completedCount += 1;
    serviceMap.set(serviceName, service);

    if (params.dataScope === 'tenant') {
      const professionalKey = row.professional_id ?? 'unknown';
      const professionalName =
        (row.professional_name ?? '').trim() || 'Profissional';
      const professional = professionalMap.get(professionalKey) ?? {
        name: professionalName,
        revenue: 0,
        completedCount: 0,
      };
      professional.revenue += price;
      professional.completedCount += 1;
      professionalMap.set(professionalKey, professional);
    }
  }

  const revenueByWeekday: SupportAnalyticsWeekdayPoint[] = [...weekdayMap.entries()]
    .sort(([left], [right]) => left - right)
    .map(([weekdayIndex, totals]) => ({
      weekdayIndex,
      weekdayLabel: WEEKDAY_LABELS[weekdayIndex] ?? `Dia ${weekdayIndex}`,
      revenue: roundCurrency(totals.revenue),
      completedCount: totals.completedCount,
    }));

  const topRevenueDays: SupportAnalyticsDayPoint[] = [...dayMap.entries()]
    .map(([date, totals]) => ({
      date,
      revenue: roundCurrency(totals.revenue),
      completedCount: totals.completedCount,
    }))
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, SUPPORT_ANALYTICS_TOP_DAYS);

  const topServices: SupportAnalyticsServicePoint[] = [...serviceMap.entries()]
    .map(([name, totals]) => ({
      name,
      revenue: roundCurrency(totals.revenue),
      completedCount: totals.completedCount,
    }))
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, SUPPORT_ANALYTICS_TOP_SERVICES);

  const roundedRevenue = roundCurrency(revenue);
  const emptyReason: SupportAnalyticsSnapshot['emptyReason'] =
    params.rows.length === 0 ? 'no_data' : 'none';

  const snapshot: SupportAnalyticsSnapshot = {
    generatedAt: (params.now ?? new Date()).toISOString(),
    periodFrom: period.periodFrom,
    periodTo: period.periodTo,
    dataScope: params.dataScope,
    currency: 'BRL',
    emptyReason,
    totals: {
      completedCount,
      revenue: roundedRevenue,
      averageTicket:
        completedCount > 0 ? roundCurrency(roundedRevenue / completedCount) : 0,
    },
    revenueByWeekday,
    topRevenueDays,
    topServices,
    byStatusCounts,
  };

  if (params.dataScope === 'tenant') {
    snapshot.byProfessional = [...professionalMap.values()]
      .map((item) => ({
        name: item.name,
        revenue: roundCurrency(item.revenue),
        completedCount: item.completedCount,
      }))
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, SUPPORT_ANALYTICS_TOP_PROFESSIONALS);
  }

  return snapshot;
}

export function serializeSupportAnalyticsSnapshot(
  snapshot: SupportAnalyticsSnapshot,
): string {
  return JSON.stringify(snapshot, null, 2);
}

export function assertSupportAnalyticsSnapshotHasNoForbiddenFields(
  snapshot: SupportAnalyticsSnapshot,
): void {
  const serialized = JSON.stringify(snapshot).toLowerCase();

  for (const key of FORBIDDEN_ANALYTICS_SUBSTRINGS) {
    if (serialized.includes(key)) {
      throw new Error(`Analytics snapshot contém campo proibido: ${key}`);
    }
  }

  if (snapshot.dataScope === 'self' && snapshot.byProfessional) {
    throw new Error(
      'Analytics snapshot self não pode incluir byProfessional.',
    );
  }
}

/**
 * Garante que filtros de query sempre levam tenant_id (e professional_id no escopo self).
 * Usado em testes e como contrato do service.
 */
export function buildSupportAnalyticsQueryFilters(params: {
  tenantId: string;
  dataScope: SupportAnalyticsDataScope;
  professionalId: string | null;
}): {
  tenantId: string;
  professionalId: string | null;
  requiresProfessionalFilter: boolean;
} {
  if (!params.tenantId.trim()) {
    throw new Error('tenant_id é obrigatório para analytics do assistente.');
  }

  if (params.dataScope === 'self') {
    if (!params.professionalId?.trim()) {
      throw new Error(
        'professional_id é obrigatório para analytics com dataScope self.',
      );
    }
    return {
      tenantId: params.tenantId,
      professionalId: params.professionalId,
      requiresProfessionalFilter: true,
    };
  }

  return {
    tenantId: params.tenantId,
    professionalId: null,
    requiresProfessionalFilter: false,
  };
}
