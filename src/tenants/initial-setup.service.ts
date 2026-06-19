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

  private async getStatusForTenant(tenant: Tenant): Promise<InitialSetupStatus> {
    if (this.isPersistedCompleteForCurrentVersion(tenant)) {
      return {
        checklistVersion: INITIAL_SETUP_CHECKLIST_VERSION,
        isComplete: true,
        isPersistedComplete: true,
        hasProfessional: true,
        hasService: true,
        hasVisitedSettings: true,
      };
    }

    const [hasProfessional, hasService] = await Promise.all([
      this.tenantHasProfessionals(tenant.id),
      this.tenantHasServices(tenant.id),
    ]);
    const hasVisitedSettings = Boolean(tenant.initial_setup_settings_visited_at);
    const isComplete = hasProfessional && hasService && hasVisitedSettings;

    if (isComplete) {
      await this.persistCompletion(tenant.id);
    }

    return {
      checklistVersion: INITIAL_SETUP_CHECKLIST_VERSION,
      isComplete,
      isPersistedComplete: false,
      hasProfessional,
      hasService,
      hasVisitedSettings,
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

  private async tenantHasProfessionals(tenantId: string): Promise<boolean> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (count ?? 0) > 0;
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
}
