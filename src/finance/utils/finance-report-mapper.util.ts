import type { AppointmentStatus } from '../../appointments/entities/appointment.entity';
import { APPOINTMENT_STATUSES } from '../../appointments/entities/appointment.entity';
import type { BookingSource } from '../../appointments/entities/booking-source.type';
import { formatAppInstantAsWallClockIso } from '../../common/format-app-instant.util';
import type {
  FinanceReportAppointment,
  FinanceReportProductSale,
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
    ...recognizedAmountForStatus(
      row.status,
      Number(row.total_price ?? lineItems.servicePrice),
    ),
    commissionAmount: Number(row.commission_amount ?? 0),
    bookingSource: normalizeBookingSource(row.booking_source),
  };
}

export function recognizedAmountForStatus(
  status: string,
  amount: number,
): { recognizedRevenue: number; countsTowardRevenue: boolean } {
  // Only completed items count toward billing ("Conta no faturamento").
  const countsTowardRevenue = status === 'COMPLETED';

  return {
    countsTowardRevenue,
    recognizedRevenue: countsTowardRevenue ? roundCurrency(amount) : 0,
  };
}

export function mapFinanceReportProductSale(row: {
  id: string;
  created_at: string;
  status: string;
  customer_name?: string | null;
  professional_id?: string | null;
  total_amount?: number | null;
  commission_amount?: number | null;
  professionals?: RelationName;
  appointments?:
    | { start_time?: string | null }
    | { start_time?: string | null }[]
    | null;
}): FinanceReportProductSale {
  const totalAmount = roundCurrency(Number(row.total_amount ?? 0));
  const counts = recognizedAmountForStatus(row.status, totalAmount);
  const appointmentRelation = Array.isArray(row.appointments)
    ? row.appointments[0]
    : row.appointments;
  const appointmentStartTime =
    appointmentRelation?.start_time?.trim() || null;

  return {
    id: row.id,
    // Real timestamptz → SP wall-clock digits (B4). Do not touch appointmentStartTime.
    createdAt: formatAppInstantAsWallClockIso(row.created_at),
    appointmentStartTime,
    status: row.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED',
    customerName: row.customer_name?.trim() || null,
    professionalId: row.professional_id?.trim() || null,
    professionalName: row.professionals
      ? extractRelationName(row.professionals)
      : null,
    totalAmount,
    commissionAmount: roundCurrency(Number(row.commission_amount ?? 0)),
    recognizedRevenue: counts.recognizedRevenue,
    countsTowardRevenue: counts.countsTowardRevenue,
  };
}

/** Effective calendar day for report filters / commission (B4). */
export function productSaleEffectiveAt(
  sale: Pick<FinanceReportProductSale, 'createdAt' | 'appointmentStartTime'>,
): string {
  return sale.appointmentStartTime || sale.createdAt;
}

export function buildFinanceReportSummary(
  appointments: FinanceReportAppointment[],
  productSales: FinanceReportProductSale[] = [],
): FinanceReportSummary {
  const completed = appointments.filter(
    (appointment) => appointment.status === 'COMPLETED',
  );
  const countedProducts = productSales.filter(
    (sale) => sale.countsTowardRevenue,
  );
  const serviceRevenue = roundCurrency(
    completed.reduce(
      (sum, appointment) => sum + appointment.recognizedRevenue,
      0,
    ),
  );
  const productRevenue = roundCurrency(
    countedProducts.reduce((sum, sale) => sum + sale.recognizedRevenue, 0),
  );
  const serviceCommissions = roundCurrency(
    completed.reduce(
      (sum, appointment) => sum + appointment.commissionAmount,
      0,
    ),
  );
  const productCommissions = roundCurrency(
    countedProducts.reduce((sum, sale) => sum + sale.commissionAmount, 0),
  );
  const totalRevenue = roundCurrency(serviceRevenue + productRevenue);
  const totalCommissions = roundCurrency(
    serviceCommissions + productCommissions,
  );

  return {
    totalRevenue,
    serviceRevenue,
    productRevenue,
    totalCommissions,
    serviceCommissions,
    productCommissions,
    netProfit: roundCurrency(totalRevenue - totalCommissions),
    appointmentCount: completed.length,
    productSaleCount: countedProducts.length,
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
