import { IsUUID } from 'class-validator';

export class RedeemLoyaltyRewardDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  customerId!: string;

  @IsUUID()
  rewardId!: string;
}
