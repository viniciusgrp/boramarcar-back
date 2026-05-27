export class CreateInternalAppointmentDto {
  professionalId!: string;
  serviceId!: string;
  startTime!: string;
  customerName?: string;
  customerPhone?: string;
  forceSchedule?: boolean;
}
