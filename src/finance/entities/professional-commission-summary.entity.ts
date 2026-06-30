export type CommissionPayoutStatus = 'PENDING' | 'PAID';

export interface CommissionAppointmentItem {
  appointmentId: string;
  serviceName: string;
  customerName: string;
  customerPhone: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  totalPrice: number;
  commissionAmount: number;
  payoutStatus: CommissionPayoutStatus | null;
  paidAt: string | null;
}

export interface ProfessionalCommissionSummary {
  professionalId: string;
  professionalName: string;
  totalRevenue: number;
  totalCommissionDue: number;
  appointmentCount: number;
  items: CommissionAppointmentItem[];
}

export interface CommissionReportResponse {
  enablePayoutControl: boolean;
  professionals: ProfessionalCommissionSummary[];
}
