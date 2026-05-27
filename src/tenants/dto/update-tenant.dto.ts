export class UpdateTenantDto {
  name!: string;
  slug!: string;
  primaryColor!: string;
  contactPhone?: string | null;
  requireDeposit!: boolean;
}
