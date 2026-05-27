export class CreateProfessionalDto {
  name!: string;
  contactPhone?: string | null;
  avatarUrl?: string;
  isActive?: boolean;
  serviceIds?: string[];
}
