import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Supplier } from './entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAllByTenant(tenantId: string): Promise<Supplier[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as Supplier[];
  }

  async createForTenant(
    tenantId: string,
    dto: CreateSupplierDto,
  ): Promise<Supplier> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('suppliers')
      .insert({
        tenant_id: tenantId,
        name: dto.name.trim(),
        contact_phone: dto.contactPhone?.trim() || null,
        contact_email: dto.contactEmail?.trim() || null,
        notes: dto.notes?.trim() || null,
        is_active: dto.isActive ?? true,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as Supplier;
  }

  async updateForTenant(
    tenantId: string,
    supplierId: string,
    dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    await this.assertBelongsToTenant(supplierId, tenantId);

    const payload: Record<string, string | boolean | null> = {};

    if (dto.name !== undefined) {
      payload.name = dto.name.trim();
    }

    if (dto.contactPhone !== undefined) {
      payload.contact_phone = dto.contactPhone?.trim() || null;
    }

    if (dto.contactEmail !== undefined) {
      payload.contact_email = dto.contactEmail?.trim() || null;
    }

    if (dto.notes !== undefined) {
      payload.notes = dto.notes?.trim() || null;
    }

    if (dto.isActive !== undefined) {
      payload.is_active = dto.isActive;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('suppliers')
      .update(payload)
      .eq('id', supplierId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as Supplier;
  }

  private async assertBelongsToTenant(
    supplierId: string,
    tenantId: string,
  ): Promise<Supplier> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('suppliers')
      .select('*')
      .eq('id', supplierId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException(
        `Supplier with id "${supplierId}" was not found for this tenant`,
      );
    }

    return data as Supplier;
  }
}
