export class BusinessHourItemDto {
  dayOfWeek!: number;
  openTime!: string;
  closeTime!: string;
  isClosed!: boolean;
}

export class UpdateBusinessHoursDto {
  hours!: BusinessHourItemDto[];
}
