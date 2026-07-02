export class UpdateLoyaltySettingsDto {
  isActive!: boolean;
  pointsPerCurrency!: number;
  defaultServicePoints?: number;
  expirationDays?: number | null;
  welcomeBonus!: number;
}
