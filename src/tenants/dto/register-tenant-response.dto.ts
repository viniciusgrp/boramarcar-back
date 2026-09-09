import { Tenant } from '../entities/tenant.entity';

export class RegisterTenantResponseDto {
  tenant!: Tenant;
  requires_email_confirmation?: boolean;
  email?: string;
  otp_type?: string;
}
