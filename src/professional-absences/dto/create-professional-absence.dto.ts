import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ProfessionalAbsenceRangeDto } from './professional-absence-range.dto';

export class CreateProfessionalAbsenceDto extends ProfessionalAbsenceRangeDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  cancelConflicting?: boolean;
}
