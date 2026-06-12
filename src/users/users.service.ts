import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantUsersService } from '../tenants/tenant-users.service';
import type { DeleteUserResponse } from './entities/delete-user-response.entity';

const DELETED_CUSTOMER_NAME = 'Usuário Excluído';
const DELETED_APPOINTMENT_PHONE = '***';

interface CustomerIdentityRow {
  id: string;
  tenant_id: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly tenantUsersService: TenantUsersService,
  ) {}

  async deleteAuthenticatedUser(authUserId: string): Promise<DeleteUserResponse> {
    const tenantMembership =
      await this.tenantUsersService.findByUserId(authUserId);

    if (tenantMembership) {
      throw new BadRequestException(
        'Contas vinculadas ao painel administrativo não podem ser excluídas por este fluxo. Envie um e-mail para privacidade@boramarcar.com.br.',
      );
    }

    const customers = await this.findCustomersByAuthUserId(authUserId);

    for (const customer of customers) {
      await this.anonymizeCustomerRecord(customer.id);
      await this.anonymizeAppointmentsForCustomer(customer.id);
    }

    const { error } = await this.supabaseService
      .getClient()
      .auth.admin.deleteUser(authUserId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { deleted: true };
  }

  private async findCustomersByAuthUserId(
    authUserId: string,
  ): Promise<CustomerIdentityRow[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('customers')
      .select('id, tenant_id')
      .eq('auth_user_id', authUserId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as CustomerIdentityRow[];
  }

  private async anonymizeCustomerRecord(customerId: string): Promise<void> {
    const anonymizedPhone = this.buildAnonymizedPhone(customerId);

    const { error } = await this.supabaseService
      .getClient()
      .from('customers')
      .update({
        auth_user_id: null,
        name: DELETED_CUSTOMER_NAME,
        phone: anonymizedPhone,
        email: null,
        birth_date: null,
        instagram_handle: null,
        acquisition_source: null,
        profile_picture_url: null,
        referral_code: null,
        referred_by_id: null,
        points_balance: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customerId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async anonymizeAppointmentsForCustomer(
    customerId: string,
  ): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .update({
        customer_name: DELETED_CUSTOMER_NAME,
        customer_phone: DELETED_APPOINTMENT_PHONE,
      })
      .eq('customer_id', customerId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private buildAnonymizedPhone(customerId: string): string {
    return `deleted-${customerId.replace(/-/g, '')}`;
  }
}
