import { IsString, IsUUID, MinLength } from 'class-validator';

export class ReleaseDepositHoldDto {
  @IsUUID()
  appointmentId!: string;

  /** Capability token (guest_access_token) required to release the hold. */
  @IsString()
  @MinLength(32)
  accessToken!: string;
}
