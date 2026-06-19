export type EmployeePayoutStatus = 'PENDING' | 'PAID';

export interface EmployeePayout {
  id: string;
  tenant_id: string;
  professional_id: string;
  appointment_id: string | null;
  amount: number;
  status: EmployeePayoutStatus;
  paid_at: string | null;
  created_at: string;
}

export interface PayoutSummaryItem {
  professionalId: string;
  professionalName: string;
  pendingAmount: number;
  pendingCount: number;
}

export interface PayoutSummaryResponse {
  enablePayoutControl: boolean;
  payoutFrequency: string;
  professionals: PayoutSummaryItem[];
}

export interface PendingPayoutServiceItem {
  payoutId: string;
  appointmentId: string | null;
  serviceName: string;
  customerName: string | null;
  appointmentDate: string | null;
  commissionAmount: number;
  totalPrice: number | null;
  createdAt: string;
}

export interface PendingPayoutServicesResponse {
  professionalId: string;
  professionalName: string;
  totalPendingAmount: number;
  items: PendingPayoutServiceItem[];
}
