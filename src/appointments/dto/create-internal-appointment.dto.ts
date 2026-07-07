export class CreateInternalAppointmentDto {
  professionalId!: string;
  /** @deprecated Use serviceIds. Kept for backward compatibility. */
  serviceId?: string;
  serviceIds?: string[];
  startTime!: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  forceSchedule?: boolean;
}
