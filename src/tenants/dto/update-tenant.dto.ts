export class UpdateTenantDto {
  name!: string;
  slug!: string;
  primaryColor!: string;
  contactPhone?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  address?: string | null;
  requireDeposit!: boolean;
}
