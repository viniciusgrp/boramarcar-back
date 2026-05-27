export class ProfessionalHourItemDto {
  dayOfWeek!: number;
  openTime!: string;
  closeTime!: string;
  isClosed!: boolean;
}

export class UpdateProfessionalHoursDto {
  hours!: ProfessionalHourItemDto[];
}
