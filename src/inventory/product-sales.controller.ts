import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import { Roles } from '../tenants/decorators/roles.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { resolveScopedProfessionalId } from '../tenants/utils/tenant-user-scope.util';
import { CreateProductSaleDto } from './dto/create-product-sale.dto';
import { ProductSaleWithItems } from './entities/product-sale.entity';
import { ProductSalesService } from './product-sales.service';

@Controller('inventory/product-sales')
@UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
export class ProductSalesController {
  constructor(private readonly productSalesService: ProductSalesService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  findAll(
    @CurrentTenantContext() context: TenantAccessContext,
    @Query('appointmentId') appointmentId?: string,
    @Query('professionalId') professionalId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ProductSaleWithItems[]> {
    const scopedProfessionalId = resolveScopedProfessionalId(context.tenantUser);

    return this.productSalesService.listByTenant(context.tenant.id, {
      appointmentId,
      professionalId: scopedProfessionalId ?? professionalId,
      startDate,
      endDate,
    });
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  create(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Body() dto: CreateProductSaleDto,
  ): Promise<ProductSaleWithItems> {
    const scopedProfessionalId = resolveScopedProfessionalId(context.tenantUser);

    if (scopedProfessionalId) {
      if (dto.professionalId && dto.professionalId !== scopedProfessionalId) {
        throw new ForbiddenException(
          'Você só pode registrar vendas em seu próprio nome.',
        );
      }

      dto.professionalId = scopedProfessionalId;
    }

    return this.productSalesService.createForTenant(
      context.tenant.id,
      dto,
      user.id,
    );
  }
}
