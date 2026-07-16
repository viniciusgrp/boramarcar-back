import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdateLoyaltySettingsDto {
  @IsBoolean()
  isActive!: boolean;

  @IsNumber()
  @Min(0)
  pointsPerCurrency!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultServicePoints?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  expirationDays?: number | null;

  @IsInt()
  @Min(0)
  welcomeBonus!: number;

  @IsOptional()
  @IsBoolean()
  refundPointsOnNoShow?: boolean;
}
