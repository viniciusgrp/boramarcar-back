type RelationName = { name: string } | { name: string }[] | null;

type ServiceRelation =
  | { name: string; duration_minutes: number; price: number }
  | { name: string; duration_minutes: number; price: number }[]
  | null;

export type AppointmentServiceRelation =
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

type CouponRelation =
  | { code: string }
  | { code: string }[]
  | null;

export interface SupabaseAppointmentWithRelations {
  id: string;
  professional_id: string;
  service_id?: string | null;
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  start_time: string;
  end_time: string;
  status: string;
  booking_source?: string;
  total_duration_minutes?: number | null;
  total_price?: number | null;
  loyalty_reward_id?: string | null;
  coupon_id?: string | null;
  coupon_discount_amount?: number | string | null;
  deposit_paid?: boolean | null;
  payment_status?: string | null;
  guest_access_token?: string | null;
  professionals: RelationName;
  services: ServiceRelation;
  coupons?: CouponRelation;
  appointment_services?: AppointmentServiceRelation | null;
}
