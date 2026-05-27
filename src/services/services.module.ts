import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [ServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
