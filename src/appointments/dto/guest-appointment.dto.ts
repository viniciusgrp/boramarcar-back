export class GuestAppointmentLookupEntryDto {
  appointmentId!: string;
  accessToken!: string;
}

export class GuestAppointmentLookupDto {
  tenantId!: string;
  entries!: GuestAppointmentLookupEntryDto[];
  scope!: 'upcoming' | 'past';
}

export class GuestAppointmentCancelDto {
  tenantId!: string;
  accessToken!: string;
}
