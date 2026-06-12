export class CreateServiceDto {
  name!: string;
  description?: string;
  durationMinutes!: number;
  price!: number;
  isActive?: boolean;
  requiresDeposit?: boolean;
  depositAmount?: number;
  customCommissionRate?: number | null;
  loyaltyPointsEarned?: number | null;
}
