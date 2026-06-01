import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANT_ACCESS_CHECK_KEY = 'skipTenantAccessCheck';

export const SkipTenantAccessCheck = () =>
  SetMetadata(SKIP_TENANT_ACCESS_CHECK_KEY, true);
