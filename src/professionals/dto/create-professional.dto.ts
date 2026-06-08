export class CreateProfessionalDto {
  name!: string;
  contactPhone?: string | null;
  avatarUrl?: string;
  commissionPercent?: number;
  isActive?: boolean;
  serviceIds?: string[];
}
