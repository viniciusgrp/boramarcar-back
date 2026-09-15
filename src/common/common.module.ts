import { Global, Module } from '@nestjs/common';
import { ApiErrorEventsService } from './api-errors/api-error-events.service';

@Global()
@Module({
  providers: [ApiErrorEventsService],
  exports: [ApiErrorEventsService],
})
export class CommonModule {}
