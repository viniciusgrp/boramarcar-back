import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { SupportService } from './support.service';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('requests')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async createRequest(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CreateSupportRequestDto,
  ): Promise<{ success: true }> {
    await this.supportService.sendRequest(context, dto);
    return { success: true };
  }
}
