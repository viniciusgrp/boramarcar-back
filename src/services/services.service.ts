import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { PlanTier } from '../tenants/entities/plan-tier.type';
import { canAccessDepositFeatures } from '../tenants/utils/plan-tier.util';
import { ProductsService } from '../inventory/products.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import type { ServiceProductItemDto } from './dto/service-product-item.dto';
import { Service, ServiceProductLink } from './entities/service.entity';
import { resolveServiceDepositFields } from './utils/service-deposit.util';
import { resolveServiceCustomCommissionRate } from './utils/service-custom-commission-rate.util';
import { resolveServiceLoyaltyPointsEarned } from './utils/service-loyalty-points.util';

const SERVICE_WITH_PRODUCTS_SELECT = '*, service_products(product_id, quantity)';

@Injectable()
export class ServicesService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly productsService: ProductsService,
  ) {}

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
      .select(SERVICE_WITH_PRODUCTS_SELECT)
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

    const created = this.mapServiceRow(data as Service);

    if (dto.products !== undefined) {
      await this.replaceServiceProducts(tenantId, created.id, dto.products);
    }

    return this.findOneWithProducts(created.id, tenantId);
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

    if (Object.keys(payload).length > 0) {
      const { error } = await this.supabaseService
        .getClient()
        .from('services')
        .update(payload)
        .eq('id', serviceId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }

    if (dto.products !== undefined) {
      await this.replaceServiceProducts(tenantId, serviceId, dto.products);
    }

    return this.findOneWithProducts(serviceId, tenantId);
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

  private async findOneWithProducts(
    serviceId: string,
    tenantId: string,
  ): Promise<Service> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('services')
      .select(SERVICE_WITH_PRODUCTS_SELECT)
      .eq('id', serviceId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapServiceRow(data as Service);
  }

  private async replaceServiceProducts(
    tenantId: string,
    serviceId: string,
    products: ServiceProductItemDto[],
  ): Promise<void> {
    const normalized = this.normalizeServiceProductItems(products);

    for (const item of normalized) {
      await this.productsService.assertProductBelongsToTenant(
        item.productId,
        tenantId,
      );
    }

    const { error: deleteError } = await this.supabaseService
      .getClient()
      .from('service_products')
      .delete()
      .eq('service_id', serviceId)
      .eq('tenant_id', tenantId);

    if (deleteError) {
      throw new InternalServerErrorException(deleteError.message);
    }

    if (normalized.length === 0) {
      return;
    }

    const rows = normalized.map((item) => ({
      service_id: serviceId,
      product_id: item.productId,
      tenant_id: tenantId,
      quantity: item.quantity,
    }));

    const { error: insertError } = await this.supabaseService
      .getClient()
      .from('service_products')
      .insert(rows);

    if (insertError) {
      throw new InternalServerErrorException(insertError.message);
    }
  }

  private normalizeServiceProductItems(
    products: ServiceProductItemDto[],
  ): Array<{ productId: string; quantity: number }> {
    const byProduct = new Map<string, number>();

    for (const item of products) {
      const productId = item.productId?.trim();
      const quantity = Number(item.quantity);

      if (!productId) {
        throw new BadRequestException('Cada produto da ficha técnica precisa de id.');
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new BadRequestException(
          'A quantidade de cada produto na ficha técnica deve ser um inteiro maior que zero.',
        );
      }

      byProduct.set(productId, (byProduct.get(productId) ?? 0) + quantity);
    }

    return [...byProduct.entries()].map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
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
    const serviceProducts = Array.isArray(row.service_products)
      ? row.service_products.map(
          (link): ServiceProductLink => ({
            product_id: link.product_id,
            quantity: Number(link.quantity),
          }),
        )
      : undefined;

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
      ...(serviceProducts !== undefined
        ? { service_products: serviceProducts }
        : {}),
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
