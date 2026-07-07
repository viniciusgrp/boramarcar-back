import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { CurrentTenantContext } from './decorators/current-tenant-context.decorator';
import type { TenantAccessContext } from './entities/tenant-access-context.entity';
import type { TenantUserListItem } from './entities/tenant-user.entity';
import { TenantAccessGuard } from './guards/tenant-access.guard';
import { RolesGuard } from './guards/roles.guard';
import { AcceptTenantUserInviteDto } from './dto/accept-tenant-user-invite.dto';
import { CreateTenantUserInviteDto } from './dto/create-tenant-user-invite.dto';
import { SignupTenantUserInviteDto } from './dto/signup-tenant-user-invite.dto';
import { UpdateTenantUserRoleDto } from './dto/update-tenant-user-role.dto';
import type { TenantMembershipSummary } from './entities/tenant-user.entity';
import type { TenantUser } from './entities/tenant-user.entity';
import { UpdateTenantUserPreferencesDto } from './dto/update-tenant-user-preferences.dto';
import type {
  TenantUserInviteListItem,
  TenantUserInvitePreview,
} from './entities/tenant-user-invite.entity';
import { normalizeUserRole } from './entities/user-role.type';
import type { UserRole } from './entities/user-role.type';
import { TenantUsersService } from './tenant-users.service';

@Controller('tenant-users')
export class TenantUsersController {
  constructor(private readonly tenantUsersService: TenantUsersService) {}

  @Patch('me/preferences')
  @UseGuards(AuthGuard)
  updateMyPreferences(
    @CurrentUser() user: User,
    @Body() dto: UpdateTenantUserPreferencesDto,
  ): Promise<TenantMembershipSummary> {
    return this.tenantUsersService.updatePreferencesForUser(user.id, dto);
  }

  @Get()
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  listMembers(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<TenantUserListItem[]> {
    return this.tenantUsersService.listForTenant(context.tenant.id);
  }

  @Post('invites')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER')
  createInvite(
    @CurrentUser() user: User,
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CreateTenantUserInviteDto,
  ): Promise<{ email: string; expiresAt: string }> {
    return this.tenantUsersService.createInviteForTenant(
      context.tenant.id,
      context.tenant.name,
      user.id,
      dto,
    );
  }

  @Post('invites/:id/resend')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER')
  resendInvite(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') inviteId: string,
  ): Promise<{ email: string; expiresAt: string }> {
    return this.tenantUsersService.resendInviteForTenant(
      context.tenant.id,
      context.tenant.name,
      inviteId,
    );
  }

  @Get('invites/pending')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER')
  listPendingInvites(
    @CurrentTenantContext() context: TenantAccessContext,
    @Query('role') role?: string,
  ): Promise<TenantUserInviteListItem[]> {
    const roleFilter =
      role?.trim() && ['ADMIN', 'PROFESSIONAL'].includes(role.trim())
        ? normalizeUserRole(role.trim() as UserRole)
        : undefined;

    return this.tenantUsersService.listPendingInvitesForTenant(
      context.tenant.id,
      roleFilter,
    );
  }

  @Get('invites/preview')
  previewInvite(
    @Query('token') token?: string,
  ): Promise<TenantUserInvitePreview> {
    if (!token?.trim()) {
      throw new BadRequestException('Query parameter "token" is required');
    }

    return this.tenantUsersService.previewInvite(token.trim());
  }

  @Post('invites/signup')
  signupViaInvite(
    @Body() dto: SignupTenantUserInviteDto,
  ): Promise<{ email: string }> {
    return this.tenantUsersService.signupViaInvite(dto);
  }

  @Post('invites/accept')
  @UseGuards(AuthGuard)
  acceptInvite(
    @CurrentUser() user: User,
    @Body() dto: AcceptTenantUserInviteDto,
  ): Promise<TenantUser> {
    return this.tenantUsersService.acceptInvite(user, dto);
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
