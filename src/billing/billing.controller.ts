import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipTenantAccessCheck } from '../tenants/decorators/skip-tenant-access-check.decorator';
import { TenantsService } from '../tenants/tenants.service';
import { DEPOSIT_FEATURE_UNAVAILABLE_MESSAGE } from '../tenants/constants/deposit-feature.constants';
import {
  canAccessDepositFeatures,
  normalizePlanTier,
} from '../tenants/utils/plan-tier.util';
import { PLAN_TIERS } from '../tenants/entities/plan-tier.type';
import type { PlanTier } from '../tenants/entities/plan-tier.type';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import { CreateAsaasAccountDto } from './dto/create-asaas-account.dto';
import { BillingService } from './billing.service';
import type { Tenant } from '../tenants/entities/tenant.entity';
import { CheckoutSessionResponse } from './entities/checkout-session-response.entity';
import type { BillingStatusResponse } from './entities/billing-status.entity';
import type {
  ChangePlanPreview,
  ChangePlanResult,
} from './entities/change-plan-preview.entity';
import { WebhookAckResponse } from './entities/webhook-ack-response.entity';
import type { AsaasWebhookEvent } from '../asaas/asaas.types';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Post('asaas/webhook')
  @SkipThrottle()
  async handleAsaasWebhook(
    @Headers('asaas-access-token') accessToken: string | undefined,
    @Body() body: AsaasWebhookEvent,
  ): Promise<WebhookAckResponse> {
    return this.billingService.handleAsaasWebhook(accessToken, body);
  }

  @Post('sync-subscription')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async syncSubscription(@CurrentUser() user: User): Promise<Tenant> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.syncTenantSubscription(tenant.id);
  }

  @Post('checkout')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async createCheckout(
    @CurrentUser() user: User,
    @Body() dto: CreateCheckoutDto,
  ): Promise<CheckoutSessionResponse> {
    const tenant = await this.resolveOwnerTenant(user.id);

    if (!user.email?.trim()) {
      throw new BadRequestException(
        'Your account must have an email address to subscribe',
      );
    }

    return this.billingService.createCheckoutSession({
      tenantId: tenant.id,
      tenantName: tenant.name,
      ownerEmail: user.email,
      planTier: normalizePlanTier(dto.planTier),
      cpfCnpj: dto.cpfCnpj,
    });
  }

  @Get('status')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async getStatus(@CurrentUser() user: User): Promise<BillingStatusResponse> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.getBillingStatus(tenant.id);
  }

  @Get('change-plan/preview')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async previewChangePlan(
    @CurrentUser() user: User,
    @Query('planTier') planTier: string | undefined,
  ): Promise<ChangePlanPreview> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.previewChangePlan(
      tenant.id,
      this.parsePlanTier(planTier),
    );
  }

  @Post('change-plan')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async changePlan(
    @CurrentUser() user: User,
    @Body() dto: ChangePlanDto,
  ): Promise<ChangePlanResult> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.changePlan(tenant.id, dto.planTier);
  }

  /** Cancels a scheduled downgrade / pending upgrade (Desfazer troca). */
  @Post('change-plan/cancel-pending')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async cancelPendingPlanChange(
    @CurrentUser() user: User,
  ): Promise<ChangePlanResult> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.cancelPendingPlanChange(tenant.id);
  }

  @Post('cancel')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async cancel(@CurrentUser() user: User): Promise<Tenant> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.cancelSubscription(tenant.id);
  }

  @Post('reactivate')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async reactivate(@CurrentUser() user: User): Promise<Tenant> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.reactivateSubscription(tenant.id);
  }

  @Post('invoice')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async openInvoice(
    @CurrentUser() user: User,
  ): Promise<CheckoutSessionResponse> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.getOpenInvoiceUrl(tenant.id);
  }

  @Post('support-ai/subscribe')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async subscribeSupportAi(@CurrentUser() user: User): Promise<Tenant> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.billingService.addSupportAiAddon(tenant.id);
  }

  @Post('connect/status')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async getConnectStatus(@CurrentUser() user: User) {
    const tenant = await this.resolveOwnerTenant(user.id);
    this.assertCanAccessDepositFeatures(tenant);
    return this.billingService.getConnectStatus(tenant.id);
  }

  @Post('connect/onboard')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async createConnectOnboarding(
    @CurrentUser() user: User,
    @Body() dto: CreateAsaasAccountDto,
  ) {
    const tenant = await this.resolveOwnerTenant(user.id);
    this.assertCanAccessDepositFeatures(tenant);
    return this.billingService.createAsaasAccount(tenant.id, dto);
  }

  @Post('connect/sync')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async syncConnectStatus(@CurrentUser() user: User) {
    const tenant = await this.resolveOwnerTenant(user.id);
    this.assertCanAccessDepositFeatures(tenant);
    await this.billingService.syncAsaasAccount(tenant.id);
    return this.billingService.getConnectStatus(tenant.id);
  }

  @Post('connect/dashboard')
  @SkipTenantAccessCheck()
  @UseGuards(AuthGuard)
  async createConnectDashboard(
    @CurrentUser() user: User,
  ): Promise<CheckoutSessionResponse> {
    const tenant = await this.resolveOwnerTenant(user.id);
    this.assertCanAccessDepositFeatures(tenant);
    return this.billingService.createConnectDashboardLink(tenant.id);
  }

  private parsePlanTier(planTier: string | undefined): PlanTier {
    const normalized = planTier?.trim().toUpperCase() ?? '';

    if (!PLAN_TIERS.includes(normalized as PlanTier)) {
      throw new BadRequestException(
        'Informe um plano válido: SOLO, PRO ou ELITE.',
      );
    }

    return normalized as PlanTier;
  }

  private assertCanAccessDepositFeatures(tenant: Tenant): void {
    if (
      !canAccessDepositFeatures(
        normalizePlanTier(tenant.plan_tier),
        tenant.deposit_feature_enabled,
      )
    ) {
      throw new ForbiddenException(DEPOSIT_FEATURE_UNAVAILABLE_MESSAGE);
    }
  }

  private async resolveOwnerTenant(userId: string) {
    const tenant = await this.tenantsService.findByOwnerId(userId);

    if (!tenant) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    return tenant;
  }
}
