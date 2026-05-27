export class UpdateProfessionalDto {
  name?: string;
  contactPhone?: string | null;
  avatarUrl?: string;
  isActive?: boolean;
  serviceIds?: string[];
}
