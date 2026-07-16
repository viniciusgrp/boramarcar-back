import { IsUUID } from 'class-validator';

export class SettlePayoutsDto {
  @IsUUID()
  professionalId!: string;
}
