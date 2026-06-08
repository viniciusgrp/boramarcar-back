import type { AppointmentStatus } from '../../appointments/entities/appointment.entity';
import { APPOINTMENT_STATUSES } from '../../appointments/entities/appointment.entity';
import type { BookingSource } from '../../appointments/entities/booking-source.type';
import type {
  FinanceReportAppointment,
  FinanceReportSummary,
} from '../entities/finance-report.entity';

type RelationName = { name: string } | { name: string }[] | null;

type AppointmentServiceRelation =
  | {
      service_id?: string;
      sort_order: number;
      duration_minutes: number;
      price: number;
      services: RelationName;
    }
  | {
      service_id?: string;
      sort_order: number;
      duration_minutes: number;
      price: number;
      services: RelationName;
    }[];

interface FinanceReportAppointmentRow {
  id: string;
  professional_id: string;
  service_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  start_time: string;
  end_time: string;
  status: string;
  total_price: number | null;
  commission_amount: number | null;
  booking_source?: string | null;
  professionals: RelationName;
  services: RelationName;
  appointment_services?: AppointmentServiceRelation | null;
}

export function isValidFinanceReportStatus(
  status: string,
): status is AppointmentStatus {
  return APPOINTMENT_STATUSES.includes(status as AppointmentStatus);
}

export function mapFinanceReportAppointmentRow(
  row: FinanceReportAppointmentRow,
): FinanceReportAppointment {
  const lineItems = extractAppointmentLineItems(row);

  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status as AppointmentStatus,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    professionalId: row.professional_id,
    professionalName: extractRelationName(row.professionals),
    serviceId: lineItems.serviceId,
    serviceName: lineItems.serviceName,
    totalPrice: Number(row.total_price ?? lineItems.servicePrice),
    commissionAmount: Number(row.commission_amount ?? 0),
    bookingSource: normalizeBookingSource(row.booking_source),
  };
}

export function buildFinanceReportSummary(
  appointments: FinanceReportAppointment[],
): FinanceReportSummary {
  const totals = appointments.reduce(
    (accumulator, appointment) => ({
      totalRevenue: accumulator.totalRevenue + appointment.totalPrice,
      totalCommissions:
        accumulator.totalCommissions + appointment.commissionAmount,
    }),
    { totalRevenue: 0, totalCommissions: 0 },
  );

  const totalRevenue = roundCurrency(totals.totalRevenue);
  const totalCommissions = roundCurrency(totals.totalCommissions);

  return {
    totalRevenue,
    totalCommissions,
    netProfit: roundCurrency(totalRevenue - totalCommissions),
    appointmentCount: appointments.length,
  };
}

function extractAppointmentLineItems(row: FinanceReportAppointmentRow): {
  serviceId: string;
  serviceName: string;
  servicePrice: number;
} {
  const junctionRows = normalizeAppointmentServices(row.appointment_services);

  if (junctionRows.length > 0) {
    const sorted = [...junctionRows].sort(
      (left, right) => left.sort_order - right.sort_order,
    );

    const priceFromJunction = sorted.reduce(
      (sum, item) => sum + Number(item.price),
      0,
    );

    return {
      serviceId: sorted[0]?.service_id ?? row.service_id,
      serviceName: sorted
        .map((item) => extractRelationName(item.services))
        .join(' + '),
      servicePrice: Number(row.total_price ?? priceFromJunction),
    };
  }

  return {
    serviceId: row.service_id,
    serviceName: extractRelationName(row.services),
    servicePrice: extractServicePrice(row.services),
  };
}

function normalizeAppointmentServices(
  relation: AppointmentServiceRelation | null | undefined,
): {
  service_id?: string;
  sort_order: number;
  duration_minutes: number;
  price: number;
  services: RelationName;
}[] {
  if (!relation) {
    return [];
  }

  return Array.isArray(relation) ? relation : [relation];
}

function extractRelationName(relation: RelationName): string {
  if (!relation) {
    return '-';
  }

  if (Array.isArray(relation)) {
    return relation[0]?.name?.trim() || '-';
  }

  return relation.name?.trim() || '-';
}

function extractServicePrice(
  service:
    | { name: string; price?: number }
    | { name: string; price?: number }[]
    | null,
): number {
  if (!service) {
    return 0;
  }

  if (Array.isArray(service)) {
    return Number(service[0]?.price ?? 0);
  }

  return Number(service.price ?? 0);
}

function normalizeBookingSource(value?: string | null): BookingSource {
  return value === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC';
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
