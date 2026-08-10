import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { FinanceService } from '../finance/finance.service';
import { ProductsService } from './products.service';
import { StockMovementsService } from './stock-movements.service';
import { CreateProductSaleDto } from './dto/create-product-sale.dto';
import {
  ProductSale,
  ProductSaleWithItems,
} from './entities/product-sale.entity';
import { calculateProductSaleLineCommission } from './utils/product-commission.util';

export interface ProductSaleFilters {
  appointmentId?: string;
  professionalId?: string;
  startDate?: string;
  endDate?: string;
}

interface ProductSaleRow extends ProductSale {
  professionals?: { name: string } | { name: string }[] | null;
  product_sale_items?: Array<{
    id: string;
    product_sale_id: string;
    tenant_id: string;
    product_id: string;
    lot_id: string | null;
    quantity: number;
    unit_price: number;
    unit_cost: number;
    commission_percent: number;
    commission_amount: number;
    subtotal: number;
    products?: { name: string } | { name: string }[] | null;
  }>;
}

const PRODUCT_SALE_SELECT = `
  *,
  professionals(name),
  product_sale_items(
    id, product_sale_id, tenant_id, product_id, lot_id, quantity, unit_price,
    unit_cost, commission_percent, commission_amount, subtotal,
    products(name)
  )
`;

@Injectable()
export class ProductSalesService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly productsService: ProductsService,
    private readonly stockMovementsService: StockMovementsService,
    private readonly financeService: FinanceService,
  ) {}

  async listByTenant(
    tenantId: string,
    filters: ProductSaleFilters = {},
  ): Promise<ProductSaleWithItems[]> {
    let query = this.supabaseService
      .getClient()
      .from('product_sales')
      .select(PRODUCT_SALE_SELECT)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (filters.appointmentId) {
      query = query.eq('appointment_id', filters.appointmentId);
    }

    if (filters.professionalId) {
      query = query.eq('professional_id', filters.professionalId);
    }

    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate);
    }

    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => this.mapSaleRow(row as ProductSaleRow));
  }

  async createForTenant(
    tenantId: string,
    dto: CreateProductSaleDto,
    performedBy: string | null,
  ): Promise<ProductSaleWithItems> {
    if (dto.items.length === 0) {
      throw new BadRequestException('Informe ao menos um produto na venda.');
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.loadProductsById(tenantId, productIds);

    const professionalProductCommissionPercent = dto.professionalId
      ? await this.loadProfessionalProductCommissionPercent(
          tenantId,
          dto.professionalId,
        )
      : null;

    let subtotalAmount = 0;
    let commissionAmount = 0;
    const lineItems = dto.items.map((item) => {
      const product = products.get(item.productId);

      if (!product) {
        throw new NotFoundException(
          `Product with id "${item.productId}" was not found for this tenant`,
        );
      }

      const unitPrice = item.unitPrice ?? Number(product.sale_price);
      const subtotal = Math.round(item.quantity * unitPrice * 100) / 100;
      const { commissionPercent, commissionAmount: lineCommission } =
        calculateProductSaleLineCommission(
          {
            quantity: item.quantity,
            unitPrice,
            customCommissionRate: product.custom_commission_rate,
          },
          professionalProductCommissionPercent,
        );

      subtotalAmount = Math.round((subtotalAmount + subtotal) * 100) / 100;
      commissionAmount =
        Math.round((commissionAmount + lineCommission) * 100) / 100;

      return {
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        unitCost: Number(product.cost_price),
        commissionPercent,
        commissionAmount: lineCommission,
        subtotal,
      };
    });

    const discountAmount = Math.round((dto.discountAmount ?? 0) * 100) / 100;
    const totalAmount = Math.max(
      0,
      Math.round((subtotalAmount - discountAmount) * 100) / 100,
    );

    if (dto.appointmentId) {
      await this.assertAppointmentBelongsToTenant(dto.appointmentId, tenantId);
    }

    const { data: sale, error: saleError } = await this.supabaseService
      .getClient()
      .from('product_sales')
      .insert({
        tenant_id: tenantId,
        appointment_id: dto.appointmentId?.trim() || null,
        professional_id: dto.professionalId?.trim() || null,
        customer_id: dto.customerId?.trim() || null,
        customer_name: dto.customerName?.trim() || null,
        customer_phone: dto.customerPhone?.trim() || null,
        payment_method: dto.paymentMethod ?? 'CASH',
        subtotal_amount: subtotalAmount,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        commission_amount: commissionAmount,
        status: 'COMPLETED',
      })
      .select('id')
      .single();

    if (saleError) {
      throw new InternalServerErrorException(saleError.message);
    }

    const saleId = sale.id as string;

    try {
      for (const line of lineItems) {
        await this.stockMovementsService.consumeStock({
          tenantId,
          productId: line.productId,
          quantity: line.quantity,
          type: 'SALE_OUT',
          appointmentId: dto.appointmentId?.trim() || null,
          productSaleId: saleId,
          professionalId: dto.professionalId?.trim() || null,
          performedBy,
        });

        const { error: itemError } = await this.supabaseService
          .getClient()
          .from('product_sale_items')
          .insert({
            product_sale_id: saleId,
            tenant_id: tenantId,
            product_id: line.productId,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            unit_cost: line.unitCost,
            commission_percent: line.commissionPercent,
            commission_amount: line.commissionAmount,
            subtotal: line.subtotal,
          });

        if (itemError) {
          throw new InternalServerErrorException(itemError.message);
        }
      }
    } catch (error) {
      await this.supabaseService
        .getClient()
        .from('product_sales')
        .delete()
        .eq('id', saleId)
        .eq('tenant_id', tenantId);

      throw error;
    }

    const tenant = await this.loadTenantPayoutSettings(tenantId);

    await this.financeService.recordProductSaleCashFlow({
      tenantId,
      productSaleId: saleId,
      professionalId: dto.professionalId?.trim() || null,
      totalAmount,
      commissionAmount,
      enablePayoutControl: tenant.enable_payout_control,
    });

    return this.findOneWithItems(tenantId, saleId);
  }

  async findOneWithItems(
    tenantId: string,
    saleId: string,
  ): Promise<ProductSaleWithItems> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('product_sales')
      .select(PRODUCT_SALE_SELECT)
      .eq('id', saleId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapSaleRow(data as ProductSaleRow);
  }

  private async loadProductsById(
    tenantId: string,
    productIds: string[],
  ): Promise<
    Map<
      string,
      { name: string; sale_price: number; cost_price: number; custom_commission_rate: number | null; is_active: boolean }
    >
  > {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('products')
      .select('id, name, sale_price, cost_price, custom_commission_rate, is_active')
      .eq('tenant_id', tenantId)
      .in('id', productIds);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const map = new Map<
      string,
      { name: string; sale_price: number; cost_price: number; custom_commission_rate: number | null; is_active: boolean }
    >();

    for (const row of data ?? []) {
      if (!row.is_active) {
        throw new BadRequestException(
          `O produto "${row.name}" está inativo e não pode ser vendido.`,
        );
      }

      map.set(row.id as string, {
        name: row.name as string,
        sale_price: Number(row.sale_price),
        cost_price: Number(row.cost_price),
        custom_commission_rate:
          row.custom_commission_rate === null || row.custom_commission_rate === undefined
            ? null
            : Number(row.custom_commission_rate),
        is_active: Boolean(row.is_active),
      });
    }

    return map;
  }

  private async loadProfessionalProductCommissionPercent(
    tenantId: string,
    professionalId: string,
  ): Promise<number | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('professionals')
      .select('product_commission_percent')
      .eq('id', professionalId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data || data.product_commission_percent === null || data.product_commission_percent === undefined) {
      return null;
    }

    return Number(data.product_commission_percent);
  }

  private async loadTenantPayoutSettings(
    tenantId: string,
  ): Promise<{ enable_payout_control: boolean }> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('tenants')
      .select('enable_payout_control')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { enable_payout_control: Boolean(data?.enable_payout_control) };
  }

  private async assertAppointmentBelongsToTenant(
    appointmentId: string,
    tenantId: string,
  ): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('appointments')
      .select('id')
      .eq('id', appointmentId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException(
        `Appointment with id "${appointmentId}" was not found for this tenant`,
      );
    }
  }

  private mapSaleRow(row: ProductSaleRow): ProductSaleWithItems {
    const professionalRelation = row.professionals;
    const professional = Array.isArray(professionalRelation)
      ? professionalRelation[0]
      : professionalRelation;

    const items = (row.product_sale_items ?? []).map((item) => {
      const productRelation = item.products;
      const product = Array.isArray(productRelation)
        ? productRelation[0]
        : productRelation;

      return {
        id: item.id,
        product_sale_id: item.product_sale_id,
        tenant_id: item.tenant_id,
        product_id: item.product_id,
        lot_id: item.lot_id,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        unit_cost: Number(item.unit_cost),
        commission_percent: Number(item.commission_percent),
        commission_amount: Number(item.commission_amount),
        subtotal: Number(item.subtotal),
        productName: product?.name ?? 'Produto removido',
      };
    });

    return {
      ...row,
      subtotal_amount: Number(row.subtotal_amount),
      discount_amount: Number(row.discount_amount),
      total_amount: Number(row.total_amount),
      commission_amount: Number(row.commission_amount),
      professionalName: professional?.name ?? null,
      items,
    };
  }
}
