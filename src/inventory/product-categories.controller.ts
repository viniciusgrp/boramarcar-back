import {
  Body,
  Controller,
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
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { ProductCategory } from './entities/product-category.entity';
import { ProductCategoriesService } from './product-categories.service';

@Controller('inventory/product-categories')
@UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
export class ProductCategoriesController {
  constructor(
    private readonly productCategoriesService: ProductCategoriesService,
  ) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  findAll(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<ProductCategory[]> {
    return this.productCategoriesService.findAllByTenant(context.tenant.id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CreateProductCategoryDto,
  ): Promise<ProductCategory> {
    return this.productCategoriesService.createForTenant(
      context.tenant.id,
      dto,
    );
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN')
  update(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductCategoryDto,
  ): Promise<ProductCategory> {
    return this.productCategoriesService.updateForTenant(
      context.tenant.id,
      id,
      dto,
    );
  }
}
