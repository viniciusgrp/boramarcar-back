export class CreateLoyaltyRewardDto {
  title!: string;
  pointsCost!: number;
  serviceId?: string | null;
  isActive?: boolean;
}
