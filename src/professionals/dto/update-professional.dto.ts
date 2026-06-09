export class UpdateProfessionalDto {
  name?: string;
  contactPhone?: string | null;
  avatarUrl?: string | null;
  commissionPercent?: number;
  isActive?: boolean;
  serviceIds?: string[];
}
