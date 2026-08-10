import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [AuthModule, TenantsModule, InventoryModule],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
