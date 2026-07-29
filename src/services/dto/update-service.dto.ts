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

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresDeposit?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customCommissionRate?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  loyaltyPointsEarned?: number | null;

  /**
   * Quando enviado (incluindo `[]`), substitui a ficha técnica.
   * Omitir o campo preserva os vínculos atuais.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceProductItemDto)
  products?: ServiceProductItemDto[];
}
