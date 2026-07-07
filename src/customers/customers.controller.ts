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
import { resolveAuthUserId } from '../auth/utils/resolve-auth-user-id.util';
import { Roles } from '../tenants/decorators/roles.decorator';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { CustomersService } from './customers.service';
import { CompleteCustomerProfileDto } from './dto/complete-customer-profile.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import type {
  Customer,
  CustomerListItem,
  CustomerMeResponse,
} from './entities/customer.entity';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('auth/signup')
  registerWithEmail(
    @Body() dto: RegisterCustomerDto,
  ): Promise<{ success: true }> {
    return this.customersService
      .registerWithEmailPassword(dto.tenantId, dto.email, dto.password)
      .then(() => ({ success: true }));
  }

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(
    @CurrentUser() user: User,
    @Query('tenantId') tenantId?: string,
  ): Promise<CustomerMeResponse> {
    if (!tenantId?.trim()) {
      throw new BadRequestException('Query parameter "tenantId" is required');
    }

    return this.customersService.getMe(resolveAuthUserId(user), tenantId.trim());
  }

  @Post('profile')
  @UseGuards(AuthGuard)
  completeProfile(
    @CurrentUser() user: User,
    @Body() dto: CompleteCustomerProfileDto,
  ): Promise<Customer> {
    return this.customersService.completeProfile(resolveAuthUserId(user), user, dto);
  }

  @Patch('profile')
  @UseGuards(AuthGuard)
  updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateCustomerProfileDto,
  ): Promise<Customer> {
    return this.customersService.updateProfile(resolveAuthUserId(user), dto);
  }

  @Get('search')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  search(
    @CurrentTenantContext() context: TenantAccessContext,
    @Query('q') query?: string,
  ): Promise<CustomerListItem[]> {
    if (!query?.trim()) {
      throw new BadRequestException('Query parameter "q" is required');
    }

    return this.customersService.searchForTenant(
      context.tenant.id,
      query.trim(),
    );
  }

  @Get()
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  listForTenant(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<CustomerListItem[]> {
    return this.customersService.listForTenant(context.tenant.id);
  }

  @Get(':id')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  findById(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') customerId: string,
  ): Promise<Customer> {
    return this.customersService.findByIdForTenant(
      context.tenant.id,
      customerId.trim(),
    );
  }
}
