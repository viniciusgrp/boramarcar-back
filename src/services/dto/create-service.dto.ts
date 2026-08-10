import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ServiceProductItemDto } from './service-product-item.dto';

export class CreateServiceDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresDeposit?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customCommissionRate?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  loyaltyPointsEarned?: number | null;

  /** Ficha técnica (BOM): produtos consumidos ao concluir o atendimento. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceProductItemDto)
  products?: ServiceProductItemDto[];
}
