import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AllowInactiveTenantAccess } from '../../tenants/decorators/allow-inactive-tenant-access.decorator';
import { CurrentTenantContext } from '../../tenants/decorators/current-tenant-context.decorator';
import { Roles } from '../../tenants/decorators/roles.decorator';
import type { TenantAccessContext } from '../../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../../tenants/guards/tenant-access.guard';
import { RolesGuard } from '../../tenants/guards/roles.guard';
import { CreateSupportAssistantMessageDto } from './dto/create-support-assistant-message.dto';
import { CreateSupportConversationDto } from './dto/create-support-conversation.dto';
import { EscalateSupportConversationDto } from './dto/escalate-support-conversation.dto';
import { ExecuteSupportActionDto } from './dto/execute-support-action.dto';
import { DismissSupportActionDto } from './dto/dismiss-support-action.dto';
import type {
  SupportAssistantMessageResponse,
  SupportAssistantStatus,
  SupportConversation,
  SupportConversationWithMessages,
} from './entities/support-assistant.types';
import type { SupportActionExecuteResult } from './actions/support-action.types';
import { SupportAssistantService } from './support-assistant.service';

@Controller('support/assistant')
@UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
@Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
@AllowInactiveTenantAccess()
export class SupportAssistantController {
  constructor(private readonly supportAssistantService: SupportAssistantService) {}

  @Get('status')
  async getStatus(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
  ): Promise<SupportAssistantStatus> {
    return this.supportAssistantService.getStatus({
      tenantId: context.tenant.id,
      userId: user.id,
    });
  }

  @Post('conversations')
  @Throttle({ medium: { limit: 5, ttl: 60_000 } })
  async createConversation(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Body() dto: CreateSupportConversationDto,
  ): Promise<SupportConversation> {
    return this.supportAssistantService.createConversation(context, user, dto);
  }

  @Get('conversations/:id')
  async getConversation(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ): Promise<SupportConversationWithMessages> {
    return this.supportAssistantService.getConversation(
      context,
      user,
      conversationId,
    );
  }

  @Post('conversations/:id/messages')
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  async sendMessage(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: CreateSupportAssistantMessageDto,
  ): Promise<SupportAssistantMessageResponse> {
    return this.supportAssistantService.sendMessage(
      context,
      user,
      conversationId,
      dto,
    );
  }

  @Post('actions/execute')
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  async executeAction(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Body() dto: ExecuteSupportActionDto,
  ): Promise<SupportActionExecuteResult> {
    return this.supportAssistantService.executeAction(context, user, dto);
  }

  @Post('actions/dismiss')
  @Throttle({ medium: { limit: 20, ttl: 60_000 } })
  async dismissAction(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Body() dto: DismissSupportActionDto,
  ): Promise<{ success: true }> {
    return this.supportAssistantService.dismissAction(context, user, dto);
  }

  @Post('conversations/:id/escalate')
  @Throttle({ medium: { limit: 3, ttl: 60_000 } })
  async escalateConversation(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Body() dto: EscalateSupportConversationDto,
  ): Promise<{ success: true }> {
    return this.supportAssistantService.escalateConversation(
      context,
      user,
      conversationId,
      dto,
    );
  }
}
