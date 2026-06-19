import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { CustomersModule } from '../customers/customers.module';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

@Module({
  imports: [AuthModule, TenantsModule, CustomersModule],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
