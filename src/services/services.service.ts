import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { PlanTier } from '../tenants/entities/plan-tier.type';
import { canAccessDepositFeatures } from '../tenants/utils/plan-tier.util';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from './entities/service.entity';
import { resolveServiceDepositFields } from './utils/service-deposit.util';
import { resolveServiceCustomCommissionRate } from './utils/service-custom-commission-rate.util';
import { resolveServiceLoyaltyPointsEarned } from './utils/service-loyalty-points.util';

@Injectable()
export class ServicesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAllByTenant(tenantId: string): Promise<Service[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => this.mapServiceRow(row as Service));
  }

  async findAllManagedByTenant(tenantId: string): Promise<Service[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => this.mapServiceRow(row as Service));
  }

  async createForTenant(
    tenantId: string,
    planTier: PlanTier,
    depositFeatureEnabled: boolean,
    dto: CreateServiceDto,
  ): Promise<Service> {
    this.validateServicePayload(dto.durationMinutes, dto.price);

    const depositFields = resolveServiceDepositFields(
      canAccessDepositFeatures(planTier, depositFeatureEnabled),
      dto.requiresDeposit,
      dto.depositAmount,
    );
    const customCommissionRate = resolveServiceCustomCommissionRate(
      planTier,
      dto.customCommissionRate,
    );
    const loyaltyPointsEarned = resolveServiceLoyaltyPointsEarned(
      dto.loyaltyPointsEarned,
    );

    const { data, error } = await this.supabaseService
      .getClient()
      .from('services')
      .insert({
        tenant_id: tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        duration_minutes: dto.durationMinutes,
        price: dto.price,
        is_active: dto.isActive ?? true,
        custom_commission_rate: customCommissionRate,
        loyalty_points_earned: loyaltyPointsEarned,
        ...depositFields,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapServiceRow(data as Service);
  }

  async updateForTenant(
    tenantId: string,
    planTier: PlanTier,
    depositFeatureEnabled: boolean,
    serviceId: string,
    dto: UpdateServiceDto,
  ): Promise<Service> {
    await this.assertServiceBelongsToTenant(serviceId, tenantId);

    if (dto.durationMinutes !== undefined && dto.durationMinutes <= 0) {
      throw new BadRequestException('durationMinutes must be greater than zero');
    }

    if (dto.price !== undefined && dto.price < 0) {
      throw new BadRequestException('price must be zero or greater');
    }

    const payload: Record<string, string | number | boolean | null> = {};

    if (dto.name !== undefined) {
      payload.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      payload.description = dto.description.trim() || null;
    }

    if (dto.durationMinutes !== undefined) {
      payload.duration_minutes = dto.durationMinutes;
    }

    if (dto.price !== undefined) {
      payload.price = dto.price;
    }

    if (dto.isActive !== undefined) {
      payload.is_active = dto.isActive;
    }

    if (dto.requiresDeposit !== undefined || dto.depositAmount !== undefined) {
      const depositFields = resolveServiceDepositFields(
        canAccessDepositFeatures(planTier, depositFeatureEnabled),
        dto.requiresDeposit,
        dto.depositAmount,
      );
      payload.requires_deposit = depositFields.requires_deposit;
      payload.deposit_amount = depositFields.deposit_amount;
    }

    if (dto.customCommissionRate !== undefined) {
      payload.custom_commission_rate = resolveServiceCustomCommissionRate(
        planTier,
        dto.customCommissionRate,
      );
    }

    if (dto.loyaltyPointsEarned !== undefined) {
      payload.loyalty_points_earned = resolveServiceLoyaltyPointsEarned(
        dto.loyaltyPointsEarned,
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('services')
      .update(payload)
      .eq('id', serviceId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapServiceRow(data as Service);
  }

  async softDeleteForTenant(
    tenantId: string,
    planTier: PlanTier,
    depositFeatureEnabled: boolean,
    serviceId: string,
  ): Promise<Service> {
    return this.updateForTenant(tenantId, planTier, depositFeatureEnabled, serviceId, {
      isActive: false,
    });
  }

  private async assertServiceBelongsToTenant(
    serviceId: string,
    tenantId: string,
  ): Promise<Service> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException(
        `Service with id "${serviceId}" was not found for this tenant`,
      );
    }

    return this.mapServiceRow(data as Service);
  }

  private mapServiceRow(row: Service): Service {
    return {
      ...row,
      requires_deposit: row.requires_deposit ?? false,
      deposit_amount:
        row.deposit_amount === null || row.deposit_amount === undefined
          ? null
          : Number(row.deposit_amount),
      custom_commission_rate:
        row.custom_commission_rate === null ||
        row.custom_commission_rate === undefined
          ? null
          : Number(row.custom_commission_rate),
      loyalty_points_earned: Number(row.loyalty_points_earned ?? 0),
      price: Number(row.price),
    };
  }

  private validateServicePayload(durationMinutes: number, price: number): void {
    if (durationMinutes <= 0) {
      throw new BadRequestException('durationMinutes must be greater than zero');
    }

    if (price < 0) {
      throw new BadRequestException('price must be zero or greater');
    }
  }
}
