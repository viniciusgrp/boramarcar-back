export class UpdateLoyaltySettingsDto {
  isActive!: boolean;
  pointsPerCurrency!: number;
  expirationDays?: number | null;
  welcomeBonus!: number;
}
