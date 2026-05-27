export interface ResolvedBookingService {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
}

export interface ResolvedBookingServices {
  items: ResolvedBookingService[];
  totalDurationMinutes: number;
  totalPrice: number;
}
