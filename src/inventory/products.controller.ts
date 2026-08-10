import {
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
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InventoryAlertsResponse, ProductWithAlerts } from './entities/product.entity';
import { ProductsService } from './products.service';

@Controller('inventory/products')
@UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN')
  findAllManaged(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<ProductWithAlerts[]> {
    return this.productsService.findAllManagedByTenant(context.tenant.id);
  }

  @Get('active')
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  findActive(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<ProductWithAlerts[]> {
    return this.productsService.findActiveByTenant(context.tenant.id);
  }

  @Get('alerts')
  @Roles('OWNER', 'ADMIN')
  getAlerts(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<InventoryAlertsResponse> {
    return this.productsService.getAlertsForTenant(context.tenant.id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CreateProductDto,
  ): Promise<ProductWithAlerts> {
    return this.productsService.createForTenant(context.tenant.id, dto);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN')
  update(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductWithAlerts> {
    return this.productsService.updateForTenant(context.tenant.id, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  softDelete(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
  ): Promise<ProductWithAlerts> {
    return this.productsService.softDeleteForTenant(context.tenant.id, id);
  }
}
