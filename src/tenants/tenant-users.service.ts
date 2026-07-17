import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
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
import type { SignupTenantUserInviteDto } from './dto/signup-tenant-user-invite.dto';
import type {
  TenantMembershipSummary,
  TenantUser,
  TenantUserListItem,
} from './entities/tenant-user.entity';
import type { UserRole } from './entities/user-role.type';
import { normalizeUserRole } from './entities/user-role.type';
import type { UpdateTenantUserRoleDto } from './dto/update-tenant-user-role.dto';
import type { UpdateTenantUserPreferencesDto } from './dto/update-tenant-user-preferences.dto';
import type {
  TenantUserInvite,
  TenantUserInviteListItem,
  TenantUserInvitePreview,
} from './entities/tenant-user-invite.entity';
import { USER_ROLE_LABELS } from './entities/user-role.type';
import { resolveProfessionalIdForRole } from './utils/resolve-professional-id-for-role.util';
import {
  normalizeAdminThemeMode,
  normalizeTenantUserPreferences,
} from './utils/tenant-user-preferences.util';
import { shouldRevokePanelMembershipOnProfessionalArchive } from './utils/inactive-professional-access.util';

interface TenantUserRow extends TenantUser {}

interface TenantUserListRow extends TenantUser {
  professionals:
    | { name: string }
    | { name: string }[]
    | null;
}

interface TenantUserInviteListRow {
  id: string;
  email: string;
  role: UserRole;
  professional_id: string | null;
  expires_at: string;
  created_at: string;
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
    preferences: normalizeTenantUserPreferences(row.preferences),
  };
}

function mapMembershipSummary(tenantUser: TenantUser): TenantMembershipSummary {
  return {
    id: tenantUser.id,
    role: tenantUser.role,
    professionalId: tenantUser.professional_id,
    preferences: tenantUser.preferences,
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

  async updatePreferencesForUser(
    userId: string,
    dto: UpdateTenantUserPreferencesDto,
  ): Promise<TenantMembershipSummary> {
    const tenantUser = await this.findByUserId(userId);

    if (!tenantUser) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    const preferences = {
      admin_theme_mode: normalizeAdminThemeMode(dto.adminThemeMode),
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .update({
        preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantUser.id)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return mapMembershipSummary(mapTenantUserRow(data as TenantUserRow));
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

  async listPendingInvitesForTenant(
    tenantId: string,
    roleFilter?: UserRole,
  ): Promise<TenantUserInviteListItem[]> {
    let query = this.supabaseService
      .getClient()
      .from('tenant_user_invites')
      .select(
        'id, email, role, professional_id, expires_at, created_at, professionals(name)',
      )
      .eq('tenant_id', tenantId)
      .is('accepted_at', null)
      .order('created_at', { ascending: false });

    if (roleFilter) {
      query = query.eq('role', roleFilter);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = (data ?? []) as TenantUserInviteListRow[];
    const now = Date.now();

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: normalizeUserRole(row.role),
      professionalId: row.professional_id,
      professionalName: this.resolveProfessionalName(row.professionals),
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      isExpired: new Date(row.expires_at).getTime() < now,
    }));
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

    await this.assertEmailCanReceiveInvite(tenantId, email);

    const professionalId = resolveProfessionalIdForRole(role, dto.professionalId);

    if (professionalId) {
      await this.assertProfessionalIsActive(tenantId, professionalId);
      await this.assertProfessionalNotLinkedToMember(tenantId, professionalId);
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = addDays(new Date(), 7).toISOString();

    const { error: revokePendingError } = await this.supabaseService
      .getClient()
      .from('tenant_user_invites')
      .delete()
      .eq('email', email)
      .is('accepted_at', null);

    if (revokePendingError) {
      throw new InternalServerErrorException(revokePendingError.message);
    }

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

  async resendInviteForTenant(
    tenantId: string,
    tenantName: string,
    inviteId: string,
  ): Promise<{ email: string; expiresAt: string }> {
    const invite = await this.findPendingInviteByIdForTenant(tenantId, inviteId);
    const role = normalizeUserRole(invite.role);

    await this.assertEmailCanReceiveInvite(tenantId, invite.email);

    const token = randomBytes(24).toString('hex');
    const expiresAt = addDays(new Date(), 7).toISOString();
    const resentAt = new Date().toISOString();

    const { error } = await this.supabaseService
      .getClient()
      .from('tenant_user_invites')
      .update({
        token,
        expires_at: expiresAt,
        created_at: resentAt,
      })
      .eq('id', invite.id)
      .eq('tenant_id', tenantId)
      .is('accepted_at', null);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const inviteUrl = `${this.resolveFrontendOrigin()}/admin/login?invite=${encodeURIComponent(token)}`;

    await this.mailService.sendTeamInvite({
      recipientEmail: invite.email,
      tenantName,
      inviteUrl,
      roleLabel: USER_ROLE_LABELS[role],
    });

    return { email: invite.email, expiresAt };
  }

  async cancelInviteForTenant(
    tenantId: string,
    inviteId: string,
  ): Promise<{ email: string }> {
    const invite = await this.findPendingInviteByIdForTenant(tenantId, inviteId);

    const { error } = await this.supabaseService
      .getClient()
      .from('tenant_user_invites')
      .delete()
      .eq('id', invite.id)
      .eq('tenant_id', tenantId)
      .is('accepted_at', null);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { email: invite.email };
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

  async signupViaInvite(
    dto: SignupTenantUserInviteDto,
  ): Promise<{ email: string }> {
    const invite = await this.findInviteByToken(dto.token?.trim() || '');
    const email = invite.email.trim().toLowerCase();
    const password = dto.password ?? '';

    if (password.length < 8) {
      throw new BadRequestException(
        'A senha deve ter pelo menos 8 caracteres, com letras e números.',
      );
    }

    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      throw new BadRequestException(
        'A senha deve ter pelo menos 8 caracteres, com letras e números.',
      );
    }

    const existingUser = await this.findAuthUserByEmail(email);

    if (existingUser) {
      throw new ConflictException(
        'Este e-mail já está cadastrado. Entre com sua senha.',
      );
    }

    await this.assertEmailCanReceiveInvite(invite.tenant_id, email);

    const { data: authData, error: authError } = await this.supabaseService
      .getClient()
      .auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      const message = authError?.message?.toLowerCase() ?? '';

      if (message.includes('already') || message.includes('registered')) {
        throw new ConflictException(
          'Este e-mail já está cadastrado. Entre com sua senha.',
        );
      }

      throw new BadRequestException(
        authError?.message ?? 'Não foi possível criar sua conta.',
      );
    }

    await this.fulfillInviteMembership(invite, authData.user.id);

    return { email };
  }

  async acceptInvite(user: User, dto: AcceptTenantUserInviteDto): Promise<TenantUser> {
    const invite = await this.findInviteByTokenRaw(dto.token?.trim() || '');
    const userEmail = user.email?.trim().toLowerCase();

    if (!userEmail || userEmail !== invite.email.trim().toLowerCase()) {
      throw new ForbiddenException(
        'O e-mail da conta autenticada não corresponde ao convite.',
      );
    }

    const existingMembership = await this.findByUserId(user.id);

    if (existingMembership) {
      if (existingMembership.tenant_id === invite.tenant_id) {
        return existingMembership;
      }

      throw new BadRequestException(
        'Esta conta já está vinculada a um estabelecimento.',
      );
    }

    if (invite.accepted_at) {
      throw new BadRequestException('Este convite já foi utilizado.');
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      throw new BadRequestException('Este convite expirou.');
    }

    return this.fulfillInviteMembership(invite, user.id);
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

  async linkOwnerProfessionalMembership(
    tenantId: string,
    userId: string,
    professionalId: string,
  ): Promise<TenantUser> {
    await this.assertProfessionalNotLinkedToMember(tenantId, professionalId);

    const existing = await this.findByUserId(userId);

    if (existing) {
      if (existing.tenant_id !== tenantId) {
        throw new BadRequestException(
          'Esta conta está vinculada a outro estabelecimento.',
        );
      }

      if (existing.role !== 'OWNER') {
        throw new ForbiddenException(
          'Somente o dono pode vincular um perfil de atendimento.',
        );
      }

      if (existing.professional_id) {
        throw new BadRequestException(
          'Você já possui um perfil de atendimento vinculado.',
        );
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .from('tenant_users')
        .update({
          professional_id: professionalId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('tenant_id', tenantId)
        .select('*')
        .single();

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      return mapTenantUserRow(data as TenantUserRow);
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        role: 'OWNER',
        professional_id: professionalId,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return mapTenantUserRow(data as TenantUserRow);
  }

  private async assertProfessionalNotLinkedToMember(
    tenantId: string,
    professionalId: string,
    excludeTenantUserId?: string,
  ): Promise<void> {
    let query = this.supabaseService
      .getClient()
      .from('tenant_users')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId);

    if (excludeTenantUserId) {
      query = query.neq('id', excludeTenantUserId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (data) {
      throw new BadRequestException(
        'Este profissional já está vinculado a outro membro da equipe.',
      );
    }
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

    const professionalId = resolveProfessionalIdForRole(role, dto.professionalId);

    if (professionalId && professionalId !== existing.professional_id) {
      await this.assertProfessionalIsActive(tenantId, professionalId);
      await this.assertProfessionalNotLinkedToMember(
        tenantId,
        professionalId,
        tenantUserId,
      );
    }

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

  async removeMemberForTenant(
    tenantId: string,
    tenantUserId: string,
  ): Promise<{ id: string }> {
    const existing = await this.findByIdForTenant(tenantId, tenantUserId);

    if (existing.role === 'OWNER') {
      throw new ForbiddenException(
        'O dono do estabelecimento não pode ser removido da equipe.',
      );
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .delete()
      .eq('id', tenantUserId)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { id: tenantUserId };
  }

  /**
   * Removes panel access for non-owner members linked to an archived
   * professional and cancels their pending invites.
   */
  async revokeAccessForArchivedProfessional(
    tenantId: string,
    professionalId: string,
  ): Promise<void> {
    const { data: members, error: membersError } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .select('id, role')
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId);

    if (membersError) {
      throw new InternalServerErrorException(membersError.message);
    }

    const memberIdsToRevoke = (members ?? [])
      .filter((row) =>
        shouldRevokePanelMembershipOnProfessionalArchive(
          normalizeUserRole(row.role),
        ),
      )
      .map((row) => row.id as string);

    if (memberIdsToRevoke.length > 0) {
      const { error: deleteMembersError } = await this.supabaseService
        .getClient()
        .from('tenant_users')
        .delete()
        .eq('tenant_id', tenantId)
        .in('id', memberIdsToRevoke);

      if (deleteMembersError) {
        throw new InternalServerErrorException(deleteMembersError.message);
      }
    }

    const { error: deleteInvitesError } = await this.supabaseService
      .getClient()
      .from('tenant_user_invites')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('professional_id', professionalId)
      .is('accepted_at', null);

    if (deleteInvitesError) {
      throw new InternalServerErrorException(deleteInvitesError.message);
    }
  }

  /**
   * @returns null when there is no linked professional; true when archived;
   * false when the profile exists and is not archived (active or paused).
   */
  async findLinkedProfessionalArchivedStatus(
    tenantId: string,
    professionalId: string | null,
  ): Promise<boolean | null> {
    if (!professionalId) {
      return null;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select('deleted_at')
      .eq('id', professionalId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return true;
    }

    return Boolean(data.deleted_at);
  }

  private async assertProfessionalIsActive(
    tenantId: string,
    professionalId: string,
  ): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select('is_active, deleted_at')
      .eq('id', professionalId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data || !data.is_active || data.deleted_at) {
      throw new BadRequestException(
        'Só é possível vincular acesso a um profissional ativo.',
      );
    }
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

  private async assertEmailCanReceiveInvite(
    tenantId: string,
    email: string,
  ): Promise<void> {
    const existingUser = await this.findAuthUserByEmail(email);

    if (!existingUser) {
      return;
    }

    const userId = existingUser.id;

    const { data: memberships, error: membershipError } =
      await this.supabaseService
        .getClient()
        .from('tenant_users')
        .select('tenant_id, tenants(name)')
        .eq('user_id', userId);

    if (membershipError) {
      throw new InternalServerErrorException(membershipError.message);
    }

    for (const row of memberships ?? []) {
      const linkedTenantName = this.resolveTenantNameFromRelation(row.tenants);

      if (row.tenant_id === tenantId) {
        throw new BadRequestException(
          'Este e-mail já faz parte da equipe deste estabelecimento.',
        );
      }

      throw new BadRequestException(
        `Este e-mail já está vinculado a "${linkedTenantName}". Hoje cada conta pode pertencer a apenas um estabelecimento.`,
      );
    }

    const { data: ownedTenant, error: ownerError } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('id, name')
      .eq('owner_id', userId)
      .maybeSingle();

    if (ownerError) {
      throw new InternalServerErrorException(ownerError.message);
    }

    if (!ownedTenant) {
      return;
    }

    const ownedTenantName = ownedTenant.name?.trim() || 'outro estabelecimento';

    if (ownedTenant.id === tenantId) {
      throw new BadRequestException(
        'Este e-mail já é o dono deste estabelecimento.',
      );
    }

    throw new BadRequestException(
      `Este e-mail já é dono do estabelecimento "${ownedTenantName}". Use outro e-mail para convidar como funcionário.`,
    );
  }

  private async findAuthUserByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    let page = 1;
    const perPage = 200;

    while (page <= 10) {
      const { data, error } = await this.supabaseService
        .getClient()
        .auth.admin.listUsers({ page, perPage });

      if (error) {
        throw new InternalServerErrorException(error.message);
      }

      const match = data.users.find(
        (user) => user.email?.trim().toLowerCase() === normalizedEmail,
      );

      if (match) {
        return match;
      }

      if (data.users.length < perPage) {
        break;
      }

      page += 1;
    }

    return null;
  }

  private resolveTenantNameFromRelation(
    relation: { name: string } | { name: string }[] | null,
  ): string {
    if (!relation) {
      return 'outro estabelecimento';
    }

    if (Array.isArray(relation)) {
      return relation[0]?.name?.trim() || 'outro estabelecimento';
    }

    return relation.name?.trim() || 'outro estabelecimento';
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

  private async fulfillInviteMembership(
    invite: TenantUserInvite,
    userId: string,
  ): Promise<TenantUser> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_users')
      .insert({
        tenant_id: invite.tenant_id,
        user_id: userId,
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

  private async findPendingInviteByIdForTenant(
    tenantId: string,
    inviteId: string,
  ): Promise<TenantUserInvite> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenant_user_invites')
      .select('*')
      .eq('id', inviteId)
      .eq('tenant_id', tenantId)
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

    return invite;
  }

  private async findInviteByTokenRaw(token: string): Promise<TenantUserInvite> {
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

    return data as TenantUserInvite;
  }

  private async findInviteByToken(token: string): Promise<TenantUserInvite> {
    const invite = await this.findInviteByTokenRaw(token);

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
