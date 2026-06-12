export class UpdateServiceDto {
  name?: string;
  description?: string;
  durationMinutes?: number;
  price?: number;
  isActive?: boolean;
  requiresDeposit?: boolean;
  depositAmount?: number | null;
  customCommissionRate?: number | null;
}
