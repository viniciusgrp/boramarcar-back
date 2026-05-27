import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Service } from './entities/service.entity';

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

    return (data ?? []) as Service[];
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

    return (data ?? []) as Service[];
  }

  async createForTenant(
    tenantId: string,
    dto: CreateServiceDto,
  ): Promise<Service> {
    this.validateServicePayload(dto.durationMinutes, dto.price);

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
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as Service;
  }

  async updateForTenant(
    tenantId: string,
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

    return data as Service;
  }

  async softDeleteForTenant(
    tenantId: string,
    serviceId: string,
  ): Promise<Service> {
    return this.updateForTenant(tenantId, serviceId, { isActive: false });
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

    return data as Service;
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
