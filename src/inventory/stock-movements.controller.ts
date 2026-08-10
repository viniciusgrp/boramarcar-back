import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../tenants/decorators/roles.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import type { User } from '@supabase/supabase-js';
import { CreateStockEntryDto } from './dto/create-stock-entry.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import type { StockMovementType } from './entities/stock-movement.entity';
import { StockMovementWithProduct } from './entities/stock-movement.entity';
import { StockMovementsService } from './stock-movements.service';

@Controller('inventory/stock-movements')
@UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
export class StockMovementsController {
  constructor(private readonly stockMovementsService: StockMovementsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN')
  findAll(
    @CurrentTenantContext() context: TenantAccessContext,
    @Query('productId') productId?: string,
    @Query('type') type?: StockMovementType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<StockMovementWithProduct[]> {
    return this.stockMovementsService.listByTenant(context.tenant.id, {
      productId,
      type,
      startDate,
      endDate,
    });
  }

  @Post('entries')
  @Roles('OWNER', 'ADMIN')
  registerEntry(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Body() dto: CreateStockEntryDto,
  ) {
    return this.stockMovementsService.registerEntry(
      context.tenant.id,
      dto,
      user.id,
    );
  }

  @Post('adjustments')
  @Roles('OWNER', 'ADMIN')
  registerAdjustment(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Body() dto: CreateStockAdjustmentDto,
  ) {
    return this.stockMovementsService.registerAdjustment(
      context.tenant.id,
      dto,
      user.id,
    );
  }
}
