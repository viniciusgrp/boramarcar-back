import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { resolveAuthUserId } from '../auth/utils/resolve-auth-user-id.util';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import { Roles } from '../tenants/decorators/roles.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { CreateLoyaltyRewardDto } from './dto/create-loyalty-reward.dto';
import { RedeemLoyaltyRewardDto } from './dto/redeem-loyalty-reward.dto';
import { UpdateLoyaltyRewardDto } from './dto/update-loyalty-reward.dto';
import { UpdateLoyaltySettingsDto } from './dto/update-loyalty-settings.dto';
import type { BookingLoyaltyFeedback } from './entities/booking-loyalty-feedback.entity';
import type { Customer } from './entities/customer.entity';
import type { LoyaltyPublicProfile } from './entities/loyalty-public-profile.entity';
import type { LoyaltyReward } from './entities/loyalty-reward.entity';
import type { LoyaltySettings } from './entities/loyalty-settings.entity';
import type { LoyaltyRedemptionHistoryItem } from './entities/loyalty-redemption-history.entity';
import type { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('settings')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async getSettings(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<LoyaltySettings> {
    return this.loyaltyService.getSettingsForTenant(context.tenant.id);
  }

  @Put('settings')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async updateSettings(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: UpdateLoyaltySettingsDto,
  ): Promise<LoyaltySettings> {
    return this.loyaltyService.updateSettingsForTenant(context.tenant.id, dto);
  }

  @Get('rewards/managed')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async findManagedRewards(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<LoyaltyReward[]> {
    return this.loyaltyService.findRewardsManagedByTenant(context.tenant.id);
  }

  @Get('redemptions/managed')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async findManagedRedemptions(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<LoyaltyRedemptionHistoryItem[]> {
    return this.loyaltyService.findRedemptionHistoryForTenant(context.tenant.id);
  }

  @Post('rewards')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async createReward(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CreateLoyaltyRewardDto,
  ): Promise<LoyaltyReward> {
    return this.loyaltyService.createRewardForTenant(context.tenant.id, dto);
  }

  @Put('rewards/:id')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async updateReward(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateLoyaltyRewardDto,
  ): Promise<LoyaltyReward> {
    return this.loyaltyService.updateRewardForTenant(
      context.tenant.id,
      id,
      dto,
    );
  }

  @Delete('rewards/:id')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async deleteReward(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
  ): Promise<LoyaltyReward> {
    return this.loyaltyService.softDeleteRewardForTenant(
      context.tenant.id,
      id,
    );
  }

  @Get('public/booking-feedback')
  async getBookingFeedback(
    @Query('appointmentId') appointmentId?: string,
  ): Promise<BookingLoyaltyFeedback> {
    if (!appointmentId?.trim()) {
      throw new BadRequestException(
        'Query parameter "appointmentId" is required',
      );
    }

    return this.loyaltyService.getBookingLoyaltyFeedbackByAppointmentId(
      appointmentId.trim(),
    );
  }

  @Get('customer/profile')
  @UseGuards(AuthGuard)
  getCustomerProfile(
    @CurrentUser() user: User,
    @Query('tenantId') tenantId?: string,
  ): Promise<LoyaltyPublicProfile> {
    if (!tenantId?.trim()) {
      throw new BadRequestException('Query parameter "tenantId" is required');
    }

    return this.loyaltyService.getProfileForAuthCustomer(
      tenantId.trim(),
      resolveAuthUserId(user),
    );
  }

  @Get('public/profile')
  async getPublicProfile(
    @Query('tenantId') tenantId?: string,
    @Query('phone') phone?: string,
  ): Promise<LoyaltyPublicProfile> {
    if (!tenantId?.trim() || !phone?.trim()) {
      throw new BadRequestException(
        'Query parameters "tenantId" and "phone" are required',
      );
    }

    return this.loyaltyService.getPublicProfile(tenantId.trim(), phone.trim());
  }

  @Post('redeem')
  @UseGuards(AuthGuard)
  async redeemReward(
    @CurrentUser() user: User,
    @Body() dto: RedeemLoyaltyRewardDto,
  ): Promise<{ customer: Customer; transaction: LoyaltyTransaction }> {
    const profile = await this.loyaltyService.getProfileForAuthCustomer(
      dto.tenantId.trim(),
      resolveAuthUserId(user),
    );

    if (!profile.customer || profile.customer.id !== dto.customerId.trim()) {
      throw new BadRequestException(
        'Você só pode resgatar pontos da sua própria conta.',
      );
    }

    return this.loyaltyService.redeemReward(
      dto.tenantId.trim(),
      dto.customerId.trim(),
      dto.rewardId.trim(),
    );
  }
}
