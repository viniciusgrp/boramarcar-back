import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
