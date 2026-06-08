import type { AppointmentStatus } from '../../appointments/entities/appointment.entity';
import type { BookingSource } from '../../appointments/entities/booking-source.type';

export interface FinanceReportSummary {
  totalRevenue: number;
  totalCommissions: number;
  netProfit: number;
  appointmentCount: number;
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
  commissionAmount: number;
  bookingSource: BookingSource;
}

export interface FinanceReportResponse {
  summary: FinanceReportSummary;
  appointments: FinanceReportAppointment[];
}

export interface FinanceReportFilters {
  startDate?: string;
  endDate?: string;
  professionalId?: string;
  serviceId?: string;
  customerId?: string;
  status?: AppointmentStatus;
}
