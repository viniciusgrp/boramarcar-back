import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@supabase/supabase-js';
import { addDays } from 'date-fns';
import { MailService } from '../mail/mail.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { AcceptTenantUserInviteDto } from './dto/accept-tenant-user-invite.dto';
import type { CreateTenantUserInviteDto } from './dto/create-tenant-user-invite.dto';
import type {
  TenantMembershipSummary,
  TenantUser,
  TenantUserListItem,
} from './entities/tenant-user.entity';
import type { UserRole } from './entities/user-role.type';
import { normalizeUserRole } from './entities/user-role.type';
import type { UpdateTenantUserRoleDto } from './dto/update-tenant-user-role.dto';
import type {
  TenantUserInvite,
  TenantUserInvitePreview,
} from './entities/tenant-user-invite.entity';
import { USER_ROLE_LABELS } from './entities/user-role.type';

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
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

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

  async createInviteForTenant(
    tenantId: string,
    tenantName: string,
    invitedByUserId: string,
    dto: CreateTenantUserInviteDto,
  ): Promise<{ email: string; expiresAt: string }> {
    const email = dto.email?.trim().toLowerCase();
    const role = normalizeUserRole(dto.role);

    if (!email) {
      throw new BadRequestException('Informe o e-mail do convidado.');
    }

    if (role === 'OWNER') {
      throw new BadRequestException(
        'Não é possível convidar um novo dono por este fluxo.',
      );
    }

    const professionalId = this.resolveProfessionalIdForRole(role, dto);
    const token = randomBytes(24).toString('hex');
    const expiresAt = addDays(new Date(), 7).toISOString();

    const { error } = await this.supabaseService
      .getClient()
      .from('tenant_user_invites')
      .upsert(
        {
          tenant_id: tenantId,
          email,
          role,
          professional_id: professionalId,
          token,
          invited_by_user_id: invitedByUserId,
          expires_at: expiresAt,
          accepted_at: null,
        },
        { onConflict: 'tenant_id,email' },
      );

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const inviteUrl = `${this.resolveFrontendOrigin()}/admin/login?invite=${encodeURIComponent(token)}`;

    await this.mailService.sendTeamInvite({
      recipientEmail: email,
      tenantName,
      inviteUrl,
      roleLabel: USER_ROLE_LABELS[role],
    });

    return { email, expiresAt };
  }

  async previewInvite(token: string): Promise<TenantUserInvitePreview> {
    const invite = await this.findInviteByToken(token.trim());

    const { data: tenant, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('name')
      .eq('id', invite.tenant_id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return {
      email: invite.email,
      role: normalizeUserRole(invite.role),
      tenantName: tenant?.name?.trim() || 'Estabelecimento',
      expiresAt: invite.expires_at,
    };
  }

  async acceptInvite(user: User, dto: AcceptTenantUserInviteDto): Promise<TenantUser> {
    const invite = await this.findInviteByToken(dto.token?.trim() || '');
    const userEmail = user.email?.trim().toLowerCase();

    if (!userEmail || userEmail !== invite.email.trim().toLowerCase()) {
      throw new ForbiddenException(
        'O e-mail da conta autenticada não corresponde ao convite.',
      );
    }

    const existingMembership = await this.findByUserId(user.id);

    if (existingMembership) {
      throw new BadRequestException(
        'Esta conta já está vinculada a um estabelecimento.',
      );
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .insert({
        tenant_id: invite.tenant_id,
        user_id: user.id,
        role: normalizeUserRole(invite.role),
        professional_id: invite.professional_id,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    await this.supabaseService
      .getClient()
      .from('tenant_user_invites')
      .update({
        accepted_at: new Date().toISOString(),
      })
      .eq('id', invite.id);

    return mapTenantUserRow(data as TenantUserRow);
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

  private async findInviteByToken(token: string): Promise<TenantUserInvite> {
    if (!token) {
      throw new BadRequestException('Token de convite inválido.');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_user_invites')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Convite não encontrado.');
    }

    const invite = data as TenantUserInvite;

    if (invite.accepted_at) {
      throw new BadRequestException('Este convite já foi aceito.');
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      throw new BadRequestException('Este convite expirou.');
    }

    return invite;
  }

  private resolveFrontendOrigin(): string {
    return (
      this.configService.get<string>('FRONTEND_URL')?.trim() ||
      'http://localhost:5173'
    );
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
