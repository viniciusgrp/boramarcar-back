import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CustomersService } from '../customers/customers.service';
import { SupabaseService } from '../supabase/supabase.service';
import { TenantsService } from '../tenants/tenants.service';
import type { CreateGuestReviewDto } from './dto/create-guest-review.dto';
import type { CreateReviewDto } from './dto/create-review.dto';
import type {
  CustomerReview,
  CustomerReviewStatus,
} from './entities/customer-review.entity';
import type {
  AdminReviewItem,
  PublicReviewsResponse,
} from './entities/review-list.entity';
import { maskCustomerFirstName } from './utils/mask-customer-name.util';

type AppointmentReviewRow = {
  id: string;
  tenant_id: string;
  status: string;
  customer_id: string | null;
  customer_name: string;
  guest_access_token?: string | null;
  services?: { name?: string | null } | { name?: string | null }[] | null;
  professionals?: { name?: string | null } | { name?: string | null }[] | null;
  start_time?: string;
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly tenantsService: TenantsService,
    private readonly customersService: CustomersService,
  ) {}

  async findPublicByTenantId(tenantId: string): Promise<PublicReviewsResponse> {
    const trimmedTenantId = tenantId.trim();

    if (!trimmedTenantId) {
      throw new BadRequestException('tenantId is required');
    }

    const tenant = await this.tenantsService.findById(trimmedTenantId);

    if (!tenant || !tenant.reviews_enabled) {
      return { averageRating: null, totalCount: 0, reviews: [] };
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customer_reviews')
      .select(
        `
        id,
        rating,
        comment,
        created_at,
        appointments (
          customer_name,
          services!service_id ( name )
        )
      `,
      )
      .eq('tenant_id', trimmedTenantId)
      .eq('status', 'PUBLISHED')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const rows = data ?? [];
    const totalCount = rows.length;
    const averageRating =
      totalCount === 0
        ? null
        : Math.round(
            (rows.reduce((sum, row) => sum + Number(row.rating), 0) / totalCount) *
              10,
          ) / 10;

    return {
      averageRating,
      totalCount,
      reviews: rows.map((row) => {
        const appointment = this.unwrapRelation(
          row.appointments as
            | { customer_name?: string; services?: unknown }
            | { customer_name?: string; services?: unknown }[]
            | null,
        );

        return {
          id: row.id as string,
          rating: Number(row.rating),
          comment: (row.comment as string | null) ?? null,
          customerFirstName: maskCustomerFirstName(appointment?.customer_name),
          serviceName: this.extractRelationName(appointment?.services) || null,
          createdAt: row.created_at as string,
        };
      }),
    };
  }

  async findAllForTenant(
    tenantId: string,
    status?: CustomerReviewStatus,
  ): Promise<AdminReviewItem[]> {
    let query = this.supabaseService
      .getClient()
      .from('customer_reviews')
      .select(
        `
        id,
        rating,
        comment,
        status,
        published_at,
        created_at,
        appointments (
          customer_name,
          start_time,
          services!service_id ( name ),
          professionals ( name )
        )
      `,
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => {
      const appointment = this.unwrapRelation(
        row.appointments as
          | {
              customer_name?: string;
              start_time?: string;
              services?: unknown;
              professionals?: unknown;
            }
          | {
              customer_name?: string;
              start_time?: string;
              services?: unknown;
              professionals?: unknown;
            }[]
          | null,
      );

      return {
        id: row.id as string,
        rating: Number(row.rating),
        comment: (row.comment as string | null) ?? null,
        status: row.status as CustomerReviewStatus,
        customerName: appointment?.customer_name?.trim() || 'Cliente',
        serviceName: this.extractRelationName(appointment?.services) || null,
        professionalName:
          this.extractRelationName(appointment?.professionals) || null,
        appointmentStartTime: appointment?.start_time ?? null,
        publishedAt: (row.published_at as string | null) ?? null,
        createdAt: row.created_at as string,
      };
    });
  }

  async createForCustomer(
    authUserId: string,
    dto: CreateReviewDto,
  ): Promise<CustomerReview> {
    const appointment = await this.loadAppointmentForReview(dto.appointmentId);

    if (!appointment.customer_id) {
      throw new BadRequestException(
        'Este agendamento não está vinculado a uma conta de cliente.',
      );
    }

    const me = await this.customersService.getMe(
      authUserId,
      appointment.tenant_id,
    );

    if (!me.customer?.id) {
      throw new BadRequestException(
        'Você não pode avaliar este agendamento.',
      );
    }

    const equivalentIds =
      await this.customersService.findEquivalentCustomerIdsForTenant(
        appointment.tenant_id,
        me.customer.phone,
      );
    const allowedIds =
      equivalentIds.length > 0 ? equivalentIds : [me.customer.id];

    if (!allowedIds.includes(appointment.customer_id)) {
      throw new BadRequestException(
        'Você não pode avaliar este agendamento.',
      );
    }

    return this.insertReview({
      tenantId: appointment.tenant_id,
      appointmentId: appointment.id,
      customerId: appointment.customer_id,
      rating: dto.rating,
      comment: dto.comment,
    });
  }

  async createForGuest(dto: CreateGuestReviewDto): Promise<CustomerReview> {
    const token = dto.guestAccessToken.trim();

    if (!token) {
      throw new BadRequestException('Token de acesso é obrigatório.');
    }

    const appointment = await this.loadAppointmentForReview(
      dto.appointmentId,
      true,
    );

    if (!appointment.guest_access_token || appointment.guest_access_token !== token) {
      throw new BadRequestException(
        'Token de acesso inválido para este agendamento.',
      );
    }

    return this.insertReview({
      tenantId: appointment.tenant_id,
      appointmentId: appointment.id,
      customerId: appointment.customer_id,
      rating: dto.rating,
      comment: dto.comment,
    });
  }

  async publishForTenant(
    tenantId: string,
    reviewId: string,
    moderatorUserId: string,
  ): Promise<CustomerReview> {
    return this.moderateReview(tenantId, reviewId, moderatorUserId, 'PUBLISHED');
  }

  async rejectForTenant(
    tenantId: string,
    reviewId: string,
    moderatorUserId: string,
  ): Promise<CustomerReview> {
    return this.moderateReview(tenantId, reviewId, moderatorUserId, 'REJECTED');
  }

  async hideForTenant(
    tenantId: string,
    reviewId: string,
    moderatorUserId: string,
  ): Promise<CustomerReview> {
    return this.moderateReview(tenantId, reviewId, moderatorUserId, 'HIDDEN');
  }

  async findStatusesByAppointmentIds(
    tenantId: string,
    appointmentIds: string[],
  ): Promise<Map<string, CustomerReviewStatus>> {
    const result = new Map<string, CustomerReviewStatus>();

    if (appointmentIds.length === 0) {
      return result;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customer_reviews')
      .select('appointment_id, status')
      .eq('tenant_id', tenantId)
      .in('appointment_id', appointmentIds);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    for (const row of data ?? []) {
      result.set(
        row.appointment_id as string,
        row.status as CustomerReviewStatus,
      );
    }

    return result;
  }

  private async moderateReview(
    tenantId: string,
    reviewId: string,
    moderatorUserId: string,
    nextStatus: CustomerReviewStatus,
  ): Promise<CustomerReview> {
    const existing = await this.assertReviewBelongsToTenant(reviewId, tenantId);
    const now = new Date().toISOString();

    if (nextStatus === 'PUBLISHED' && existing.status === 'PUBLISHED') {
      return existing;
    }

    if (nextStatus === 'HIDDEN' && existing.status !== 'PUBLISHED') {
      throw new BadRequestException(
        'Só é possível ocultar avaliações publicadas.',
      );
    }

    if (
      nextStatus === 'REJECTED' &&
      existing.status !== 'PENDING' &&
      existing.status !== 'PUBLISHED' &&
      existing.status !== 'HIDDEN'
    ) {
      throw new BadRequestException('Esta avaliação não pode ser rejeitada.');
    }

    if (
      nextStatus === 'PUBLISHED' &&
      existing.status !== 'PENDING' &&
      existing.status !== 'HIDDEN'
    ) {
      throw new BadRequestException(
        'Só é possível publicar avaliações pendentes ou ocultas.',
      );
    }

    const payload: Record<string, string | null> = {
      status: nextStatus,
      moderated_at: now,
      moderated_by: moderatorUserId,
      updated_at: now,
    };

    if (nextStatus === 'PUBLISHED') {
      payload.published_at = existing.published_at ?? now;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customer_reviews')
      .update(payload)
      .eq('id', reviewId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapReviewRow(data as CustomerReview);
  }

  private async insertReview(params: {
    tenantId: string;
    appointmentId: string;
    customerId: string | null;
    rating: number;
    comment?: string | null;
  }): Promise<CustomerReview> {
    const tenant = await this.tenantsService.findById(params.tenantId);

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado.');
    }

    if (!tenant.reviews_enabled) {
      throw new BadRequestException(
        'Avaliações não estão ativas neste estabelecimento.',
      );
    }

    const comment = params.comment?.trim() || null;

    if (comment && comment.length > 500) {
      throw new BadRequestException(
        'O comentário deve ter no máximo 500 caracteres.',
      );
    }

    if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) {
      throw new BadRequestException('A nota deve ser um inteiro entre 1 e 5.');
    }

    const status: CustomerReviewStatus = tenant.reviews_auto_publish
      ? 'PUBLISHED'
      : 'PENDING';
    const now = new Date().toISOString();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('customer_reviews')
      .insert({
        tenant_id: params.tenantId,
        appointment_id: params.appointmentId,
        customer_id: params.customerId,
        rating: params.rating,
        comment,
        status,
        published_at: status === 'PUBLISHED' ? now : null,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          'Este agendamento já possui uma avaliação.',
        );
      }

      throw new InternalServerErrorException(error.message);
    }

    return this.mapReviewRow(data as CustomerReview);
  }

  private async loadAppointmentForReview(
    appointmentId: string,
    includeGuestToken = false,
  ): Promise<AppointmentReviewRow> {
    const trimmedId = appointmentId.trim();

    if (!trimmedId) {
      throw new BadRequestException('appointmentId is required');
    }

    const select = includeGuestToken
      ? 'id, tenant_id, status, customer_id, customer_name, guest_access_token, start_time'
      : 'id, tenant_id, status, customer_id, customer_name, start_time';

    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select(select)
      .eq('id', trimmedId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Agendamento não encontrado.');
    }

    const appointment = data as unknown as AppointmentReviewRow;

    if (appointment.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Só é possível avaliar agendamentos concluídos.',
      );
    }

    return appointment;
  }

  private async assertReviewBelongsToTenant(
    reviewId: string,
    tenantId: string,
  ): Promise<CustomerReview> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('customer_reviews')
      .select('*')
      .eq('id', reviewId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Avaliação não encontrada.');
    }

    return this.mapReviewRow(data as CustomerReview);
  }

  private mapReviewRow(row: CustomerReview): CustomerReview {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      appointment_id: row.appointment_id,
      customer_id: row.customer_id ?? null,
      rating: Number(row.rating),
      comment: row.comment ?? null,
      status: row.status,
      published_at: row.published_at ?? null,
      moderated_at: row.moderated_at ?? null,
      moderated_by: row.moderated_by ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
    if (!value) {
      return null;
    }

    return Array.isArray(value) ? (value[0] ?? null) : value;
  }

  private extractRelationName(value: unknown): string {
    const relation = this.unwrapRelation(
      value as { name?: string | null } | { name?: string | null }[] | null,
    );

    return relation?.name?.trim() ?? '';
  }
}
