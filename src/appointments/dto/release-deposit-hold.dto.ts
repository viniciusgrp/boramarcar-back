import { IsUUID } from 'class-validator';

export class ReleaseDepositHoldDto {
  @IsUUID()
  appointmentId!: string;
}
