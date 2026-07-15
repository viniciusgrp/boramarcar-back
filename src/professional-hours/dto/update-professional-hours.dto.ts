import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProfessionalHourItemDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsString()
  openTime!: string;

  @IsString()
  closeTime!: string;

  @IsBoolean()
  isClosed!: boolean;
}

export class UpdateProfessionalHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProfessionalHourItemDto)
  hours!: ProfessionalHourItemDto[];
}
