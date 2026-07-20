import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { normalizePhoneKey } from '../loyalty/utils/loyalty-points.util';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import type { Coupon } from './entities/coupon.entity';
import type { CouponRedemptionHistoryItem } from './entities/coupon-redemption.entity';
import type { CouponValidationResult } from './entities/coupon-validation-result.entity';
import { calculateCouponDiscountAmount } from './utils/coupon-discount.util';

@Injectable()
export class CouponsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAllForTenant(tenantId: string): Promise<Coupon[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('coupons')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => this.mapCouponRow(row as Coupon));
  }

  async findRedemptionsForCoupon(
    tenantId: string,
    couponId: string,
  ): Promise<CouponRedemptionHistoryItem[]> {
    await this.assertCouponBelongsToTenant(couponId, tenantId);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('coupon_redemptions')
      .select(
        `
        id,
        coupon_id,
        tenant_id,
        customer_id,
        customer_phone,
        appointment_id,
        discount_amount_applied,
        created_at,
        coupons ( code ),
        customers ( name ),
        appointments ( start_time )
      `,
      )
      .eq('tenant_id', tenantId)
      .eq('coupon_id', couponId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) =>
      this.mapRedemptionHistoryRow(
        row as Parameters<typeof this.mapRedemptionHistoryRow>[0],
      ),
    );
  }

  async createForTenant(
    tenantId: string,
    dto: CreateCouponDto,
  ): Promise<Coupon> {
    const code = this.normalizeCode(dto.code);
    this.validateDiscountValue(dto.discountType, dto.discountValue);
    this.validateValidityWindow(dto.validFrom, dto.validUntil);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('coupons')
      .insert({
        tenant_id: tenantId,
        code,
        description: dto.description?.trim() || null,
        discount_type: dto.discountType,
        discount_value: dto.discountValue,
        max_uses: dto.maxUses ?? null,
        max_uses_per_customer: dto.maxUsesPerCustomer ?? null,
        first_visit_only: dto.firstVisitOnly ?? false,
        min_purchase_amount: dto.minPurchaseAmount ?? null,
        valid_from: dto.validFrom ?? null,
        valid_until: dto.validUntil ?? null,
        is_active: dto.isActive ?? true,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException(
          `Já existe um cupom com o código "${code}" neste estabelecimento.`,
        );
      }

      throw new InternalServerErrorException(error.message);
    }

    return this.mapCouponRow(data as Coupon);
  }

  async updateForTenant(
    tenantId: string,
    couponId: string,
    dto: UpdateCouponDto,
  ): Promise<Coupon> {
    const existing = await this.assertCouponBelongsToTenant(couponId, tenantId);

    const payload: Record<string, string | number | boolean | null> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.code !== undefined) {
      payload.code = this.normalizeCode(dto.code);
    }

    if (dto.description !== undefined) {
      payload.description = dto.description?.trim() || null;
    }

    const nextDiscountType = dto.discountType ?? existing.discount_type;
    const nextDiscountValue = dto.discountValue ?? existing.discount_value;

    if (dto.discountType !== undefined || dto.discountValue !== undefined) {
      this.validateDiscountValue(nextDiscountType, nextDiscountValue);
      payload.discount_type = nextDiscountType;
      payload.discount_value = nextDiscountValue;
    }

    if (dto.maxUses !== undefined) {
      payload.max_uses = dto.maxUses;
    }

    if (dto.maxUsesPerCustomer !== undefined) {
      payload.max_uses_per_customer = dto.maxUsesPerCustomer;
    }

    if (dto.firstVisitOnly !== undefined) {
      payload.first_visit_only = dto.firstVisitOnly;
    }

    if (dto.minPurchaseAmount !== undefined) {
      payload.min_purchase_amount = dto.minPurchaseAmount;
    }

    if (dto.validFrom !== undefined || dto.validUntil !== undefined) {
      const nextValidFrom =
        dto.validFrom !== undefined ? dto.validFrom : existing.valid_from;
      const nextValidUntil =
        dto.validUntil !== undefined ? dto.validUntil : existing.valid_until;
      this.validateValidityWindow(nextValidFrom, nextValidUntil);
      payload.valid_from = nextValidFrom;
      payload.valid_until = nextValidUntil;
    }

    if (dto.isActive !== undefined) {
      payload.is_active = dto.isActive;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('coupons')
      .update(payload)
      .eq('id', couponId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException(
          'Já existe um cupom com esse código neste estabelecimento.',
        );
      }

      throw new InternalServerErrorException(error.message);
    }

    return this.mapCouponRow(data as Coupon);
  }

  async deleteForTenant(tenantId: string, couponId: string): Promise<Coupon> {
    return this.updateForTenant(tenantId, couponId, { isActive: false });
  }

  /** Dry-run validation: checks eligibility and computes the discount without consuming usage. */
  async validateCouponForBooking(params: {
    tenantId: string;
    code: string;
    totalPrice: number;
    customerPhone?: string | null;
  }): Promise<CouponValidationResult> {
    const coupon = await this.findActiveCouponByCode(
      params.tenantId,
      params.code,
    );

    await this.assertCouponIsRedeemable(coupon, {
      totalPrice: params.totalPrice,
      customerPhone: params.customerPhone,
    });

    const discountAmount = calculateCouponDiscountAmount(
      coupon,
      params.totalPrice,
    );

    return {
      coupon,
      discountAmount,
      finalPrice: Math.max(params.totalPrice - discountAmount, 0),
    };
  }

  /** Validates + atomically consumes one use of the coupon. Call only right before creating the appointment. */
  async redeemCouponForAppointment(params: {
    tenantId: string;
    code: string;
    totalPrice: number;
    appointmentId: string;
    customerId?: string | null;
    customerPhone?: string | null;
  }): Promise<CouponValidationResult> {
    const validation = await this.validateCouponForBooking({
      tenantId: params.tenantId,
      code: params.code,
      totalPrice: params.totalPrice,
      customerPhone: params.customerPhone,
    });

    const { error: rpcError } = await this.supabaseService
      .getClient()
      .rpc('redeem_coupon_atomic', {
        p_coupon_id: validation.coupon.id,
        p_tenant_id: params.tenantId,
      });

    if (rpcError) {
      if (rpcError.message?.includes('coupon_redemption_limit_reached')) {
        throw new BadRequestException(
          'Este cupom já atingiu o limite de usos.',
        );
      }

      throw new InternalServerErrorException(rpcError.message);
    }

    const { error: ledgerError } = await this.supabaseService
      .getClient()
      .from('coupon_redemptions')
      .insert({
        coupon_id: validation.coupon.id,
        tenant_id: params.tenantId,
        customer_id: params.customerId ?? null,
        customer_phone: params.customerPhone?.trim() || null,
        appointment_id: params.appointmentId,
        discount_amount_applied: validation.discountAmount,
      });

    if (ledgerError) {
      throw new InternalServerErrorException(ledgerError.message);
    }

    return validation;
  }

  private async assertCouponIsRedeemable(
    coupon: Coupon,
    params: { totalPrice: number; customerPhone?: string | null },
  ): Promise<void> {
    const now = new Date();

    if (coupon.valid_from && now < new Date(coupon.valid_from)) {
      throw new BadRequestException('Este cupom ainda não está disponível.');
    }

    if (coupon.valid_until && now > new Date(coupon.valid_until)) {
      throw new BadRequestException('Este cupom expirou.');
    }

    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      throw new BadRequestException(
        'Este cupom já atingiu o limite de usos.',
      );
    }

    if (
      coupon.min_purchase_amount !== null &&
      params.totalPrice < coupon.min_purchase_amount
    ) {
      throw new BadRequestException(
        `Este cupom exige um valor mínimo de R$ ${coupon.min_purchase_amount.toFixed(2)} em serviços.`,
      );
    }

    const phoneKey = params.customerPhone
      ? normalizePhoneKey(params.customerPhone)
      : null;

    if (coupon.first_visit_only) {
      if (!phoneKey) {
        throw new BadRequestException(
          'Este cupom é válido apenas para a primeira visita. Informe seu telefone para validar.',
        );
      }

      const hasPriorAppointment = await this.hasPriorAppointmentForPhone(
        coupon.tenant_id,
        phoneKey,
      );

      if (hasPriorAppointment) {
        throw new BadRequestException(
          'Este cupom é válido apenas para clientes na primeira visita.',
        );
      }
    }

    if (coupon.max_uses_per_customer !== null && phoneKey) {
      const usesByCustomer = await this.countRedemptionsForPhone(
        coupon.id,
        coupon.tenant_id,
        phoneKey,
      );

      if (usesByCustomer >= coupon.max_uses_per_customer) {
        throw new BadRequestException(
          'Você já usou este cupom o número máximo de vezes permitido.',
        );
      }
    }
  }

  private async hasPriorAppointmentForPhone(
    tenantId: string,
    phoneKey: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('customer_phone', phoneKey)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return Boolean(data);
  }

  private async countRedemptionsForPhone(
    couponId: string,
    tenantId: string,
    phoneKey: string,
  ): Promise<number> {
    const { count, error } = await this.supabaseService
      .getClient()
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', couponId)
      .eq('tenant_id', tenantId)
      .eq('customer_phone', phoneKey);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return count ?? 0;
  }

  private async findActiveCouponByCode(
    tenantId: string,
    code: string,
  ): Promise<Coupon> {
    const normalizedCode = this.normalizeCode(code);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('coupons')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('code', normalizedCode)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data || !(data as Coupon).is_active) {
      throw new NotFoundException('Cupom não encontrado ou inativo.');
    }

    return this.mapCouponRow(data as Coupon);
  }

  private async assertCouponBelongsToTenant(
    couponId: string,
    tenantId: string,
  ): Promise<Coupon> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('coupons')
      .select('*')
      .eq('id', couponId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException('Cupom não encontrado para este estabelecimento.');
    }

    return this.mapCouponRow(data as Coupon);
  }

  private normalizeCode(code: string): string {
    const trimmed = code?.trim().toUpperCase();

    if (!trimmed) {
      throw new BadRequestException('Field "code" is required');
    }

    return trimmed;
  }

  private validateDiscountValue(
    discountType: string,
    discountValue: number,
  ): void {
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      throw new BadRequestException(
        'Field "discountValue" must be greater than zero',
      );
    }

    if (discountType === 'PERCENTAGE' && discountValue > 100) {
      throw new BadRequestException(
        'Desconto percentual não pode ser maior que 100%.',
      );
    }
  }

  private validateValidityWindow(
    validFrom?: string | null,
    validUntil?: string | null,
  ): void {
    if (
      validFrom &&
      validUntil &&
      new Date(validFrom).getTime() > new Date(validUntil).getTime()
    ) {
      throw new BadRequestException(
        'A data de início da validade não pode ser depois da data de término.',
      );
    }
  }

  private mapCouponRow(row: Coupon): Coupon {
    return {
      ...row,
      discount_value: Number(row.discount_value),
      max_uses: row.max_uses === null ? null : Number(row.max_uses),
      used_count: Number(row.used_count ?? 0),
      max_uses_per_customer:
        row.max_uses_per_customer === null
          ? null
          : Number(row.max_uses_per_customer),
      min_purchase_amount:
        row.min_purchase_amount === null
          ? null
          : Number(row.min_purchase_amount),
    };
  }

  private mapRedemptionHistoryRow(row: {
    id: string;
    coupon_id: string;
    tenant_id: string;
    customer_id: string | null;
    customer_phone: string | null;
    appointment_id: string;
    discount_amount_applied: number | string;
    created_at: string;
    coupons: { code: string } | { code: string }[] | null;
    customers: { name: string } | { name: string }[] | null;
    appointments: { start_time: string } | { start_time: string }[] | null;
  }): CouponRedemptionHistoryItem {
    const couponRelation = row.coupons;
    const coupon = Array.isArray(couponRelation)
      ? couponRelation[0]
      : couponRelation;

    const customerRelation = row.customers;
    const customer = Array.isArray(customerRelation)
      ? customerRelation[0]
      : customerRelation;

    const appointmentRelation = row.appointments;
    const appointment = Array.isArray(appointmentRelation)
      ? appointmentRelation[0]
      : appointmentRelation;

    return {
      id: row.id,
      coupon_id: row.coupon_id,
      tenant_id: row.tenant_id,
      customer_id: row.customer_id,
      customer_phone: row.customer_phone,
      appointment_id: row.appointment_id,
      discount_amount_applied: Number(row.discount_amount_applied ?? 0),
      created_at: row.created_at,
      coupon_code: coupon?.code ?? '',
      customer_name: customer?.name ?? null,
      appointment_start_time: appointment?.start_time ?? null,
    };
  }
}
