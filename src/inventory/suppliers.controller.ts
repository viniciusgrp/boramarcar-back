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
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Supplier } from './entities/supplier.entity';
import { SuppliersService } from './suppliers.service';

@Controller('inventory/suppliers')
@UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @Roles('OWNER', 'ADMIN')
  findAll(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<Supplier[]> {
    return this.suppliersService.findAllByTenant(context.tenant.id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CreateSupplierDto,
  ): Promise<Supplier> {
    return this.suppliersService.createForTenant(context.tenant.id, dto);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN')
  update(
    @CurrentTenantContext() context: TenantAccessContext,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    return this.suppliersService.updateForTenant(context.tenant.id, id, dto);
  }
}
