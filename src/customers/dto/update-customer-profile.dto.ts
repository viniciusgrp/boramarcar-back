export class UpdateCustomerProfileDto {
  tenantId!: string;
  name?: string;
  profilePictureUrl?: string | null;
  instagramHandle?: string | null;
  birthDate?: string | null;
}
