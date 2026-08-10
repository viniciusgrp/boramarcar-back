import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { FinanceModule } from '../finance/finance.module';
import { ProductCategoriesController } from './product-categories.controller';
import { ProductCategoriesService } from './product-categories.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { StockMovementsController } from './stock-movements.controller';
import { StockMovementsService } from './stock-movements.service';
import { ProductSalesController } from './product-sales.controller';
import { ProductSalesService } from './product-sales.service';

@Module({
  imports: [AuthModule, TenantsModule, FinanceModule],
  controllers: [
    ProductCategoriesController,
    SuppliersController,
    ProductsController,
    StockMovementsController,
    ProductSalesController,
  ],
  providers: [
    ProductCategoriesService,
    SuppliersService,
    ProductsService,
    StockMovementsService,
    ProductSalesService,
  ],
  exports: [ProductsService, ProductSalesService, StockMovementsService],
})
export class InventoryModule {}
