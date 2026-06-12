import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { OptionalAuthGuard } from './optional-auth.guard';

@Module({
  providers: [AuthGuard, OptionalAuthGuard],
  exports: [AuthGuard, OptionalAuthGuard],
})
export class AuthModule {}
