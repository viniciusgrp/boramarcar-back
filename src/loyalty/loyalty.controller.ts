import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { TenantsService } from '../tenants/tenants.service';
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
  constructor(
    private readonly loyaltyService: LoyaltyService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get('settings')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async getSettings(@CurrentUser() user: User): Promise<LoyaltySettings> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.loyaltyService.getSettingsForTenant(tenant.id);
  }

  @Put('settings')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async updateSettings(
    @CurrentUser() user: User,
    @Body() dto: UpdateLoyaltySettingsDto,
  ): Promise<LoyaltySettings> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.loyaltyService.updateSettingsForTenant(tenant.id, dto);
  }

  @Get('rewards/managed')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async findManagedRewards(@CurrentUser() user: User): Promise<LoyaltyReward[]> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.loyaltyService.findRewardsManagedByTenant(tenant.id);
  }

  @Get('redemptions/managed')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async findManagedRedemptions(
    @CurrentUser() user: User,
  ): Promise<LoyaltyRedemptionHistoryItem[]> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.loyaltyService.findRedemptionHistoryForTenant(tenant.id);
  }

  @Post('rewards')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async createReward(
    @CurrentUser() user: User,
    @Body() dto: CreateLoyaltyRewardDto,
  ): Promise<LoyaltyReward> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.loyaltyService.createRewardForTenant(tenant.id, dto);
  }

  @Put('rewards/:id')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async updateReward(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateLoyaltyRewardDto,
  ): Promise<LoyaltyReward> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.loyaltyService.updateRewardForTenant(tenant.id, id, dto);
  }

  @Delete('rewards/:id')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async deleteReward(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<LoyaltyReward> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.loyaltyService.softDeleteRewardForTenant(tenant.id, id);
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
    if (!dto.tenantId?.trim() || !dto.customerId?.trim() || !dto.rewardId?.trim()) {
      throw new BadRequestException(
        'Fields "tenantId", "customerId" and "rewardId" are required',
      );
    }

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

  private async resolveOwnerTenant(userId: string) {
    const tenant = await this.tenantsService.findByOwnerId(userId);

    if (!tenant) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    return tenant;
  }
}
