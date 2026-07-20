import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import { Roles } from '../tenants/decorators/roles.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import type { Coupon } from './entities/coupon.entity';
import type { CouponRedemptionHistoryItem } from './entities/coupon-redemption.entity';
import type { CouponValidationResult } from './entities/coupon-validation-result.entity';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async findAll(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<Coupon[]> {
    return this.couponsService.findAllForTenant(context.tenant.id);
  }

  @Get(':id/redemptions')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async findRedemptions(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
  ): Promise<CouponRedemptionHistoryItem[]> {
    return this.couponsService.findRedemptionsForCoupon(
      context.tenant.id,
      id,
    );
  }

  @Post()
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async create(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CreateCouponDto,
  ): Promise<Coupon> {
    return this.couponsService.createForTenant(context.tenant.id, dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async update(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
  ): Promise<Coupon> {
    return this.couponsService.updateForTenant(context.tenant.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async remove(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
  ): Promise<Coupon> {
    return this.couponsService.deleteForTenant(context.tenant.id, id);
  }

  @Post('public/validate')
  async validatePublic(
    @Body() dto: ValidateCouponDto,
  ): Promise<CouponValidationResult> {
    if (!dto.tenantId?.trim() || !dto.code?.trim()) {
      throw new BadRequestException(
        'Fields "tenantId" and "code" are required',
      );
    }

    return this.couponsService.validateCouponForBooking({
      tenantId: dto.tenantId.trim(),
      code: dto.code.trim(),
      totalPrice: dto.totalPrice,
      customerPhone: dto.customerPhone?.trim() || null,
    });
  }
}
