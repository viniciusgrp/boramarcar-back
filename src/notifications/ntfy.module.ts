import { Module } from '@nestjs/common';
import { NtfyService } from './ntfy.service';

@Module({
  providers: [NtfyService],
  exports: [NtfyService],
})
export class NtfyModule {}
