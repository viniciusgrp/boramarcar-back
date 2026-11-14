import type { AppointmentStatus } from '../../appointments/entities/appointment.entity';
import type { BookingSource } from '../../appointments/entities/booking-source.type';

export interface FinanceReportSummary {
  totalRevenue: number;
  serviceRevenue: number;
  productRevenue: number;
  totalCommissions: number;
  serviceCommissions: number;
  productCommissions: number;
  netProfit: number;
  appointmentCount: number;
  productSaleCount: number;
}

export interface FinanceReportAppointment {
  id: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  serviceName: string;
  totalPrice: number;
  recognizedRevenue: number;
  countsTowardRevenue: boolean;
  commissionAmount: number;
  bookingSource: BookingSource;
}

export interface FinanceReportProductSale {
  id: string;
  /** Real sale timestamptz as UTC ISO. Front formats once in America/Sao_Paulo. */
  createdAt: string;
  /**
   * Appointment wall-clock start when the sale is linked to a booking;
   * null for walk-in / standalone sales. Stored shop-clock digits — do not
   * zone-convert. Use for “day of the appointment”, not sale time of day.
   */
  appointmentStartTime: string | null;
  status: 'COMPLETED' | 'CANCELLED';
  customerName: string | null;
  professionalId: string | null;
  professionalName: string | null;
  totalAmount: number;
  commissionAmount: number;
  recognizedRevenue: number;
  countsTowardRevenue: boolean;
}

export interface FinanceReportResponse {
  summary: FinanceReportSummary;
  appointments: FinanceReportAppointment[];
  productSales: FinanceReportProductSale[];
}

export interface FinanceReportFilters {
  startDate?: string;
  endDate?: string;
  professionalId?: string;
  serviceId?: string;
  customerId?: string;
  status?: AppointmentStatus;
}
