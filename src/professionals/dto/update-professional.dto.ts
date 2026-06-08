export class UpdateProfessionalDto {
  name?: string;
  contactPhone?: string | null;
  avatarUrl?: string;
  commissionPercent?: number;
  isActive?: boolean;
  serviceIds?: string[];
}
