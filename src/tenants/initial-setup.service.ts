import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { InitialSetupStatus } from './entities/initial-setup-status.entity';
import type { Tenant } from './entities/tenant.entity';
import { INITIAL_SETUP_CHECKLIST_VERSION } from './initial-setup.constants';
import { TenantsService } from './tenants.service';
import { normalizePlanTier, canAccessDepositFeatures } from './utils/plan-tier.util';
import { isSubscriptionActive } from './utils/tenant-access.util';

@Injectable()
export class InitialSetupService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly tenantsService: TenantsService,
  ) {}

  async getStatusForUser(userId: string): Promise<InitialSetupStatus> {
    const accessContext = await this.tenantsService.findAccessContextByUserId(
      userId,
    );

    if (!accessContext) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    return this.getStatusForTenant(accessContext.tenant);
  }

  async markSettingsVisitedForUser(userId: string): Promise<InitialSetupStatus> {
    const accessContext = await this.tenantsService.findAccessContextByUserId(
      userId,
    );

    if (!accessContext) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    const tenant = accessContext.tenant;

    if (!tenant.initial_setup_settings_visited_at) {
      const { error } = await this.supabaseService
        .getClient()
        .from('tenants')
        .update({
          initial_setup_settings_visited_at: new Date().toISOString(),
        })
        .eq('id', tenant.id);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }

    const refreshedTenant = await this.tenantsService.findById(tenant.id);

    if (!refreshedTenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    return this.getStatusForTenant(refreshedTenant);
  }

  async markBookingLinkSharedForUser(
    userId: string,
  ): Promise<InitialSetupStatus> {
    const accessContext = await this.tenantsService.findAccessContextByUserId(
      userId,
    );

    if (!accessContext) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    const tenant = accessContext.tenant;

    if (!tenant.initial_setup_booking_link_shared_at) {
      const { error } = await this.supabaseService
        .getClient()
        .from('tenants')
        .update({
          initial_setup_booking_link_shared_at: new Date().toISOString(),
        })
        .eq('id', tenant.id);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }

    const refreshedTenant = await this.tenantsService.findById(tenant.id);

    if (!refreshedTenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    return this.getStatusForTenant(refreshedTenant);
  }

  private async getStatusForTenant(tenant: Tenant): Promise<InitialSetupStatus> {
    const requiresStripeConnect = canAccessDepositFeatures(
      normalizePlanTier(tenant.plan_tier),
      tenant.deposit_feature_enabled,
    );

    if (this.isPersistedCompleteForCurrentVersion(tenant)) {
      const professionalCount = await this.tenantProfessionalCount(tenant.id);

      return {
        checklistVersion: INITIAL_SETUP_CHECKLIST_VERSION,
        isComplete: true,
        isPersistedComplete: true,
        hasProfessional: true,
        hasService: true,
        hasBranding: true,
        hasBusinessHours: true,
        hasContactPhone: true,
        hasVisitedSettings: true,
        hasSharedBookingLink: true,
        hasCustomerAccountPolicy: true,
        hasReviewsEnabled: true,
        hasStripeConnect: true,
        requiresStripeConnect,
        hasActiveSubscription: true,
        hasExtraProfessional: professionalCount > 1,
        hasReviewedBusinessHours: Boolean(
          tenant.initial_setup_hours_reviewed_at,
        ),
      };
    }

    const [professionalCount, hasService, hasBusinessHours] = await Promise.all([
      this.tenantProfessionalCount(tenant.id),
      this.tenantHasServices(tenant.id),
      this.tenantHasOpenBusinessHours(tenant.id),
    ]);
    const hasProfessional = professionalCount > 0;
    const hasExtraProfessional = professionalCount > 1;
    const hasBranding = Boolean(tenant.logo_url || tenant.banner_url);
    const hasContactPhone = Boolean(tenant.contact_phone?.trim());
    const hasAddress = Boolean(
      tenant.address_street?.trim() && tenant.address_city?.trim(),
    );
    const hasVisitedSettings =
      Boolean(tenant.initial_setup_settings_visited_at) &&
      (hasContactPhone || hasAddress);
    const hasSharedBookingLink = Boolean(
      tenant.initial_setup_booking_link_shared_at,
    );
    const hasCustomerAccountPolicy = Boolean(
      tenant.initial_setup_customer_account_decided_at,
    );
    const hasReviewsEnabled = Boolean(tenant.reviews_enabled);
    const hasReviewedBusinessHours = Boolean(
      tenant.initial_setup_hours_reviewed_at,
    );
    const hasStripeConnect = Boolean(tenant.stripe_connect_charges_enabled);
    const hasActiveSubscription = isSubscriptionActive(
      tenant.subscription_status,
    );
    const isComplete =
      hasProfessional &&
      hasService &&
      hasBranding &&
      hasBusinessHours &&
      hasContactPhone &&
      hasVisitedSettings &&
      hasCustomerAccountPolicy &&
      hasReviewsEnabled &&
      (!requiresStripeConnect || hasStripeConnect) &&
      hasActiveSubscription;

    if (isComplete) {
      await this.persistCompletion(tenant.id);
    }

    return {
      checklistVersion: INITIAL_SETUP_CHECKLIST_VERSION,
      isComplete,
      isPersistedComplete: false,
      hasProfessional,
      hasService,
      hasBranding,
      hasBusinessHours,
      hasContactPhone,
      hasVisitedSettings,
      hasSharedBookingLink,
      hasCustomerAccountPolicy,
      hasReviewsEnabled,
      hasStripeConnect,
      requiresStripeConnect,
      hasActiveSubscription,
      hasExtraProfessional,
      hasReviewedBusinessHours,
    };
  }

  private isPersistedCompleteForCurrentVersion(tenant: Tenant): boolean {
    return Boolean(
      tenant.initial_setup_completed_at &&
        (tenant.initial_setup_version ?? 0) >= INITIAL_SETUP_CHECKLIST_VERSION,
    );
  }

  private async persistCompletion(tenantId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .update({
        initial_setup_completed_at: new Date().toISOString(),
        initial_setup_version: INITIAL_SETUP_CHECKLIST_VERSION,
      })
      .eq('id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async tenantProfessionalCount(tenantId: string): Promise<number> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('deleted_at', null);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return count ?? 0;
  }

  private async tenantHasServices(tenantId: string): Promise<boolean> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('services')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (count ?? 0) > 0;
  }

  private async tenantHasOpenBusinessHours(tenantId: string): Promise<boolean> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('business_hours')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_closed', false);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (count ?? 0) > 0;
  }
}
