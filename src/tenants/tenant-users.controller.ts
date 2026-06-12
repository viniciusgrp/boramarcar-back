import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentTenantContext } from './decorators/current-tenant-context.decorator';
import type { TenantAccessContext } from './entities/tenant-access-context.entity';
import type { TenantUserListItem } from './entities/tenant-user.entity';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { RolesGuard } from './guards/roles.guard';
import { UpdateTenantUserRoleDto } from './dto/update-tenant-user-role.dto';
import { TenantUsersService } from './tenant-users.service';

@Controller('tenant-users')
export class TenantUsersController {
  constructor(private readonly tenantUsersService: TenantUsersService) {}

  @Get()
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  listMembers(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<TenantUserListItem[]> {
    return this.tenantUsersService.listForTenant(context.tenant.id);
  }

  @Patch(':id/role')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER')
  updateRole(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') tenantUserId: string,
    @Body() dto: UpdateTenantUserRoleDto,
  ): Promise<TenantUserListItem> {
    return this.tenantUsersService.updateRoleForTenant(
      context.tenant.id,
      tenantUserId,
      dto,
    );
  }
}
