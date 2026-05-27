export class CreateAppointmentDto {
  tenantId!: string;
  professionalId!: string;
  /** @deprecated Use serviceIds. Kept for backward compatibility. */
  serviceId?: string;
  serviceIds?: string[];
  customerName!: string;
  customerPhone!: string;
  startTime!: string;
}
