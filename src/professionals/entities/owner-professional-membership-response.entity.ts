import type { TenantMembershipSummary } from '../../tenants/entities/tenant-user.entity';
import type { Professional } from './professional.entity';

export interface OwnerProfessionalMembershipResponse {
  professional: Professional;
  membership: TenantMembershipSummary;
}
