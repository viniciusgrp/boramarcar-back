type RelationName = { name: string } | { name: string }[] | null;

type ServiceRelation =
  | { name: string; duration_minutes: number; price: number }
  | { name: string; duration_minutes: number; price: number }[]
  | null;

export interface SupabaseAppointmentWithRelations {
  id: string;
  professional_id: string;
  customer_name: string;
  customer_phone: string;
  start_time: string;
  end_time: string;
  status: string;
  professionals: RelationName;
  services: ServiceRelation;
}
