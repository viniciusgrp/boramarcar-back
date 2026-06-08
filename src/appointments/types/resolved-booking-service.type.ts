export interface ResolvedBookingService {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  requiresDeposit: boolean;
  depositAmount: number;
}

export interface ResolvedBookingServices {
  items: ResolvedBookingService[];
  totalDurationMinutes: number;
  totalPrice: number;
  totalDepositAmount: number;
  requiresDeposit: boolean;
}
