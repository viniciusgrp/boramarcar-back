import type { AppointmentServiceRelation } from './supabase-appointment-row.type';

type RelationName = { name: string } | { name: string }[] | null;

type TenantRelation = {
  id: string;
  name: string;
  address_cep: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
} | {
  id: string;
  name: string;
  address_cep: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
}[] | null;

type CustomerRelation =
  | { email: string | null }
  | { email: string | null }[]
  | null;

export interface ReminderAppointmentRow {
  id: string;
  customer_name: string;
  start_time: string;
  tenants: TenantRelation;
  customers: CustomerRelation;
  professionals: RelationName;
  services: RelationName;
  appointment_services?: AppointmentServiceRelation | null;
}
