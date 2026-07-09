import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { TenantsModule } from '../tenants/tenants.module';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  imports: [AuthModule, TenantsModule, MailModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
