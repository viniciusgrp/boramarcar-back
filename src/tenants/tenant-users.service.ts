import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  TenantMembershipSummary,
  TenantUser,
  TenantUserListItem,
} from './entities/tenant-user.entity';
import type { UserRole } from './entities/user-role.type';
import { normalizeUserRole } from './entities/user-role.type';
import type { UpdateTenantUserRoleDto } from './dto/update-tenant-user-role.dto';

interface TenantUserRow extends TenantUser {}

interface TenantUserListRow extends TenantUser {
  professionals:
    | { name: string }
    | { name: string }[]
    | null;
}

function mapTenantUserRow(row: TenantUserRow): TenantUser {
  return {
    ...row,
    role: normalizeUserRole(row.role),
    professional_id: row.professional_id ?? null,
  };
}

function mapMembershipSummary(tenantUser: TenantUser): TenantMembershipSummary {
  return {
    id: tenantUser.id,
    role: tenantUser.role,
    professionalId: tenantUser.professional_id,
  };
}

@Injectable()
export class TenantUsersService {
  constructor(private readonly supabaseService: SupabaseService) {}

  mapMembershipSummary(tenantUser: TenantUser): TenantMembershipSummary {
    return mapMembershipSummary(tenantUser);
  }

  async findByUserId(userId: string): Promise<TenantUser | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data ? mapTenantUserRow(data as TenantUserRow) : null;
  }

  async listForTenant(tenantId: string): Promise<TenantUserListItem[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .select('*, professionals(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as TenantUserListRow[];
    const items: TenantUserListItem[] = [];

    for (const row of rows) {
      const email = await this.resolveUserEmail(row.user_id);
      const professionalName = this.resolveProfessionalName(row.professionals);

      items.push({
        id: row.id,
        userId: row.user_id,
        email,
        role: normalizeUserRole(row.role),
        professionalId: row.professional_id,
        professionalName,
      });
    }

    return items;
  }

  async createOwnerMembership(
    tenantId: string,
    userId: string,
  ): Promise<TenantUser> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        role: 'OWNER',
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return mapTenantUserRow(data as TenantUserRow);
  }

  async updateRoleForTenant(
    tenantId: string,
    tenantUserId: string,
    dto: UpdateTenantUserRoleDto,
  ): Promise<TenantUserListItem> {
    const role = normalizeUserRole(dto.role);

    if (role === 'OWNER') {
      throw new BadRequestException(
        'Use a transferência de propriedade para definir um novo dono.',
      );
    }

    const existing = await this.findByIdForTenant(tenantId, tenantUserId);

    if (existing.role === 'OWNER') {
      throw new ForbiddenException('A função do dono não pode ser alterada.');
    }

    const professionalId = this.resolveProfessionalIdForRole(role, dto);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .update({
        role,
        professional_id: professionalId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantUserId)
      .eq('tenant_id', tenantId)
      .select('*, professionals(name)')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const row = data as TenantUserListRow;

    return {
      id: row.id,
      userId: row.user_id,
      email: await this.resolveUserEmail(row.user_id),
      role: normalizeUserRole(row.role),
      professionalId: row.professional_id,
      professionalName: this.resolveProfessionalName(row.professionals),
    };
  }

  private async findByIdForTenant(
    tenantId: string,
    tenantUserId: string,
  ): Promise<TenantUser> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .select('*')
      .eq('id', tenantUserId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Membro da equipe não encontrado.');
    }

    return mapTenantUserRow(data as TenantUserRow);
  }

  private resolveProfessionalIdForRole(
    role: UserRole,
    dto: UpdateTenantUserRoleDto,
  ): string | null {
    if (role !== 'PROFESSIONAL') {
      return null;
    }

    const professionalId = dto.professionalId?.trim();

    if (!professionalId) {
      throw new BadRequestException(
        'Informe o profissional vinculado para a função de barbeiro.',
      );
    }

    return professionalId;
  }

  private async resolveUserEmail(userId: string): Promise<string> {
    const { data, error } = await this.supabaseService
      .getClient()
      .auth.admin.getUserById(userId);

    if (error) {
      return 'Usuário sem e-mail';
    }

    return data.user?.email?.trim() || 'Usuário sem e-mail';
  }

  private resolveProfessionalName(
    relation: TenantUserListRow['professionals'],
  ): string | null {
    if (!relation) {
      return null;
    }

    if (Array.isArray(relation)) {
      return relation[0]?.name?.trim() || null;
    }

    return relation.name?.trim() || null;
  }
}
