import { IsISO8601 } from 'class-validator';

export class ProfessionalAbsenceRangeDto {
  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;
}
