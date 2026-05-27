import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProfessionalDto } from './dto/create-professional.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { Professional } from './entities/professional.entity';

const PROFESSIONAL_WITH_SERVICES_SELECT =
  '*, professional_services(service_id)';

@Injectable()
export class ProfessionalsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAllByTenant(tenantId: string): Promise<Professional[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select(PROFESSIONAL_WITH_SERVICES_SELECT)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as Professional[];
  }

  async findAllManagedByTenant(tenantId: string): Promise<Professional[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select(PROFESSIONAL_WITH_SERVICES_SELECT)
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as Professional[];
  }

  async createForTenant(
    tenantId: string,
    dto: CreateProfessionalDto,
  ): Promise<Professional> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .insert({
        tenant_id: tenantId,
        name: dto.name.trim(),
        contact_phone: this.normalizeContactPhone(dto.contactPhone),
        avatar_url: dto.avatarUrl?.trim() || null,
        is_active: dto.isActive ?? true,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const professional = data as Professional;

    await this.replaceProfessionalServices(
      tenantId,
      professional.id,
      dto.serviceIds ?? [],
    );

    return this.findOneWithServices(professional.id, tenantId);
  }

  async updateForTenant(
    tenantId: string,
    professionalId: string,
    dto: UpdateProfessionalDto,
  ): Promise<Professional> {
    await this.assertProfessionalBelongsToTenant(professionalId, tenantId);

    const payload: Record<string, string | boolean | null> = {};

    if (dto.name !== undefined) {
      payload.name = dto.name.trim();
    }

    if (dto.avatarUrl !== undefined) {
      payload.avatar_url = dto.avatarUrl.trim() || null;
    }

    if (dto.isActive !== undefined) {
      payload.is_active = dto.isActive;
    }

    if (dto.contactPhone !== undefined) {
      payload.contact_phone = this.normalizeContactPhone(dto.contactPhone);
    }

    if (Object.keys(payload).length > 0) {
      const { error } = await this.supabaseService
        .getClient()
        .from('professionals')
        .update(payload)
        .eq('id', professionalId)
        .eq('tenant_id', tenantId);

      if (error) {
        throw new InternalServerErrorException(error.message);
      }
    }

    if (dto.serviceIds !== undefined) {
      await this.replaceProfessionalServices(
        tenantId,
        professionalId,
        dto.serviceIds,
      );
    }

    return this.findOneWithServices(professionalId, tenantId);
  }

  async softDeleteForTenant(
    tenantId: string,
    professionalId: string,
  ): Promise<Professional> {
    return this.updateForTenant(tenantId, professionalId, { isActive: false });
  }

  private async replaceProfessionalServices(
    tenantId: string,
    professionalId: string,
    serviceIds: string[],
  ): Promise<void> {
    const { error: deleteError } = await this.supabaseService
      .getClient()
      .from('professional_services')
      .delete()
      .eq('professional_id', professionalId)
      .eq('tenant_id', tenantId);

    if (deleteError) {
      throw new InternalServerErrorException(deleteError.message);
    }

    const uniqueServiceIds = [...new Set(serviceIds.filter(Boolean))];

    if (uniqueServiceIds.length === 0) {
      return;
    }

    const rows = uniqueServiceIds.map((serviceId) => ({
      professional_id: professionalId,
      service_id: serviceId,
      tenant_id: tenantId,
    }));

    const { error: insertError } = await this.supabaseService
      .getClient()
      .from('professional_services')
      .insert(rows);

    if (insertError) {
      throw new InternalServerErrorException(insertError.message);
    }
  }

  async findOneWithServices(
    professionalId: string,
    tenantId: string,
  ): Promise<Professional> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select(PROFESSIONAL_WITH_SERVICES_SELECT)
      .eq('id', professionalId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as Professional;
  }

  async assertProfessionalBelongsToTenant(
    professionalId: string,
    tenantId: string,
  ): Promise<Professional> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select('*')
      .eq('id', professionalId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException(
        `Professional with id "${professionalId}" was not found for this tenant`,
      );
    }

    return data as Professional;
  }

  private normalizeContactPhone(phone?: string | null): string | null {
    if (phone === undefined || phone === null) {
      return null;
    }

    const trimmed = phone.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
