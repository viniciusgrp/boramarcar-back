import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ProductsService } from './products.service';
import { CreateStockEntryDto } from './dto/create-stock-entry.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import {
  StockMovement,
  StockMovementType,
  StockMovementWithProduct,
} from './entities/stock-movement.entity';
import {
  ConsumableLot,
  LotConsumption,
  selectLotsForConsumptionFefo,
} from './utils/fefo-consumption.util';
import { aggregateBomQuantitiesByProduct } from './utils/service-bom.util';

export interface StockMovementFilters {
  productId?: string;
  type?: StockMovementType;
  startDate?: string;
  endDate?: string;
}

export interface ConsumeStockParams {
  tenantId: string;
  productId: string;
  quantity: number;
  type: 'SALE_OUT' | 'INTERNAL_USE_OUT' | 'ADJUSTMENT_OUT' | 'EXPIRED_OUT';
  reason?: string | null;
  appointmentId?: string | null;
  productSaleId?: string | null;
  professionalId?: string | null;
  performedBy?: string | null;
  /** Consome um lote específico em vez de seguir FEFO (usado em ajustes pontuais). */
  lotId?: string | null;
}

interface ProductLotRow {
  id: string;
  expiry_date: string | null;
  received_at: string;
  quantity_remaining: number;
  unit_cost: number;
}

@Injectable()
export class StockMovementsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly productsService: ProductsService,
  ) {}

  async listByTenant(
    tenantId: string,
    filters: StockMovementFilters = {},
  ): Promise<StockMovementWithProduct[]> {
    let query = this.supabaseService
      .getClient()
      .from('stock_movements')
      .select('*, products(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (filters.productId) {
      query = query.eq('product_id', filters.productId);
    }

    if (filters.type) {
      query = query.eq('type', filters.type);
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

    return (data ?? []).map((row) => {
      const productRelation = row.products as
        | { name: string }
        | { name: string }[]
        | null;
      const product = Array.isArray(productRelation)
        ? productRelation[0]
        : productRelation;

      return {
        ...(row as StockMovement),
        productName: product?.name ?? 'Produto removido',
      };
    });
  }

  /** Registra uma entrada de estoque (compra), criando um novo lote e atualizando o custo médio. */
  async registerEntry(
    tenantId: string,
    dto: CreateStockEntryDto,
    performedBy: string | null,
  ): Promise<StockMovement> {
    const product = await this.productsService.assertProductBelongsToTenant(
      dto.productId,
      tenantId,
    );

    const { data: lot, error: lotError } = await this.supabaseService
      .getClient()
      .from('product_lots')
      .insert({
        tenant_id: tenantId,
        product_id: dto.productId,
        supplier_id: dto.supplierId?.trim() || null,
        lot_number: dto.lotNumber?.trim() || null,
        expiry_date: dto.expiryDate || null,
        unit_cost: dto.unitCost,
        quantity_received: dto.quantity,
        quantity_remaining: dto.quantity,
      })
      .select('id')
      .single();

    if (lotError) {
      throw new InternalServerErrorException(lotError.message);
    }

    const currentStock = Number(product.current_stock);
    const currentCost = Number(product.cost_price);
    const nextStock = Math.round(currentStock + dto.quantity);
    const newAverageCost =
      nextStock > 0
        ? Math.round(
            ((currentStock * currentCost + dto.quantity * dto.unitCost) /
              nextStock) *
              100,
          ) / 100
        : dto.unitCost;

    await this.productsService.applyStockDelta(
      tenantId,
      dto.productId,
      dto.quantity,
      newAverageCost,
    );

    const totalCost = Math.round(dto.quantity * dto.unitCost * 100) / 100;

    const { data: movement, error: movementError } = await this.supabaseService
      .getClient()
      .from('stock_movements')
      .insert({
        tenant_id: tenantId,
        product_id: dto.productId,
        lot_id: lot.id as string,
        type: 'PURCHASE_IN',
        quantity: dto.quantity,
        unit_cost: dto.unitCost,
        total_cost: totalCost,
        performed_by: performedBy,
      })
      .select('*')
      .single();

    if (movementError) {
      throw new InternalServerErrorException(movementError.message);
    }

    return movement as StockMovement;
  }

  /** Ajuste manual: correção positiva, perda/quebra ou vencimento de estoque. */
  async registerAdjustment(
    tenantId: string,
    dto: CreateStockAdjustmentDto,
    performedBy: string | null,
  ): Promise<StockMovement> {
    if (dto.type === 'ADJUSTMENT_IN') {
      return this.registerAdjustmentIn(tenantId, dto, performedBy);
    }

    const consumptions = await this.consumeStock({
      tenantId,
      productId: dto.productId,
      quantity: dto.quantity,
      type: dto.type,
      reason: dto.reason,
      performedBy,
      lotId: dto.lotId ?? null,
    });

    return consumptions[consumptions.length - 1];
  }

  private async registerAdjustmentIn(
    tenantId: string,
    dto: CreateStockAdjustmentDto,
    performedBy: string | null,
  ): Promise<StockMovement> {
    const product = await this.productsService.assertProductBelongsToTenant(
      dto.productId,
      tenantId,
    );

    const { data: lot, error: lotError } = await this.supabaseService
      .getClient()
      .from('product_lots')
      .insert({
        tenant_id: tenantId,
        product_id: dto.productId,
        unit_cost: product.cost_price,
        quantity_received: dto.quantity,
        quantity_remaining: dto.quantity,
      })
      .select('id')
      .single();

    if (lotError) {
      throw new InternalServerErrorException(lotError.message);
    }

    await this.productsService.applyStockDelta(tenantId, dto.productId, dto.quantity);

    const { data: movement, error: movementError } = await this.supabaseService
      .getClient()
      .from('stock_movements')
      .insert({
        tenant_id: tenantId,
        product_id: dto.productId,
        lot_id: lot.id as string,
        type: 'ADJUSTMENT_IN',
        quantity: dto.quantity,
        reason: dto.reason.trim(),
        performed_by: performedBy,
      })
      .select('*')
      .single();

    if (movementError) {
      throw new InternalServerErrorException(movementError.message);
    }

    return movement as StockMovement;
  }

  /**
   * Consome estoque seguindo FEFO (ou um lote específico), criando um movimento
   * de saída por lote afetado e atualizando os saldos de lote e produto.
   * Retorna os movimentos criados (um por lote consumido) com o unit_cost do lote.
   */
  async consumeStock(params: ConsumeStockParams): Promise<StockMovement[]> {
    const product = await this.productsService.assertProductBelongsToTenant(
      params.productId,
      params.tenantId,
    );

    if (
      ['ADJUSTMENT_OUT', 'EXPIRED_OUT'].includes(params.type) &&
      !params.reason?.trim()
    ) {
      throw new BadRequestException('Informe o motivo do ajuste de estoque.');
    }

    const lots = await this.fetchConsumableLots(
      params.tenantId,
      params.productId,
      params.lotId,
    );
    const consumableLots: ConsumableLot[] = lots.map((lot) => ({
      id: lot.id,
      expiryDate: lot.expiry_date,
      receivedAt: lot.received_at,
      quantityRemaining: Number(lot.quantity_remaining),
      unitCost: Number(lot.unit_cost),
    }));

    const { consumptions, shortfall } = selectLotsForConsumptionFefo(
      consumableLots,
      params.quantity,
    );

    if (shortfall > 0) {
      throw new BadRequestException(
        `Estoque insuficiente para "${product.name}". Faltam ${shortfall} unidade(s).`,
      );
    }

    const movements: StockMovement[] = [];

    for (const consumption of consumptions) {
      await this.decrementLotRemaining(consumption);

      const totalCost =
        Math.round(consumption.quantity * consumption.unitCost * 100) / 100;

      const { data: movement, error: movementError } = await this.supabaseService
        .getClient()
        .from('stock_movements')
        .insert({
          tenant_id: params.tenantId,
          product_id: params.productId,
          lot_id: consumption.lotId,
          type: params.type,
          quantity: consumption.quantity,
          unit_cost: consumption.unitCost,
          total_cost: totalCost,
          reason: params.reason?.trim() || null,
          appointment_id: params.appointmentId ?? null,
          product_sale_id: params.productSaleId ?? null,
          professional_id: params.professionalId ?? null,
          performed_by: params.performedBy ?? null,
        })
        .select('*')
        .single();

      if (movementError) {
        throw new InternalServerErrorException(movementError.message);
      }

      movements.push(movement as StockMovement);
    }

    const totalConsumed = consumptions.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    await this.productsService.applyStockDelta(
      params.tenantId,
      params.productId,
      -totalConsumed,
    );

    return movements;
  }

  /**
   * Debita a ficha técnica (BOM) dos serviços do atendimento ao concluir.
   * Idempotente: se já existir INTERNAL_USE_OUT para o appointment, não faz nada.
   * Deve ser chamado ANTES de persistir o status COMPLETED.
   */
  async consumeAppointmentServiceBom(params: {
    tenantId: string;
    appointmentId: string;
    serviceIds: string[];
    professionalId?: string | null;
    performedBy?: string | null;
  }): Promise<StockMovement[]> {
    if (params.serviceIds.length === 0) {
      return [];
    }

    const { data: existingMovements, error: existingError } =
      await this.supabaseService
        .getClient()
        .from('stock_movements')
        .select('id')
        .eq('tenant_id', params.tenantId)
        .eq('appointment_id', params.appointmentId)
        .eq('type', 'INTERNAL_USE_OUT')
        .limit(1);

    if (existingError) {
      throw new InternalServerErrorException(existingError.message);
    }

    if ((existingMovements ?? []).length > 0) {
      return [];
    }

    const { data: bomRows, error: bomError } = await this.supabaseService
      .getClient()
      .from('service_products')
      .select('service_id, product_id, quantity')
      .eq('tenant_id', params.tenantId)
      .in('service_id', params.serviceIds);

    if (bomError) {
      throw new InternalServerErrorException(bomError.message);
    }

    const aggregated = aggregateBomQuantitiesByProduct(
      (bomRows ?? []).map(
        (row: {
          service_id: string;
          product_id: string;
          quantity: number;
        }) => ({
          serviceId: row.service_id,
          productId: row.product_id,
          quantity: Number(row.quantity),
        }),
      ),
    );

    if (aggregated.length === 0) {
      return [];
    }

    const movements: StockMovement[] = [];

    for (const item of aggregated) {
      const created = await this.consumeStock({
        tenantId: params.tenantId,
        productId: item.productId,
        quantity: item.quantity,
        type: 'INTERNAL_USE_OUT',
        reason: 'Consumo automático da ficha técnica do serviço',
        appointmentId: params.appointmentId,
        professionalId: params.professionalId ?? null,
        performedBy: params.performedBy ?? null,
      });
      movements.push(...created);
    }

    return movements;
  }

  private async fetchConsumableLots(
    tenantId: string,
    productId: string,
    lotId?: string | null,
  ): Promise<ProductLotRow[]> {
    let query = this.supabaseService
      .getClient()
      .from('product_lots')
      .select('id, expiry_date, received_at, quantity_remaining, unit_cost')
      .eq('tenant_id', tenantId)
      .eq('product_id', productId)
      .gt('quantity_remaining', 0);

    if (lotId) {
      query = query.eq('id', lotId);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as ProductLotRow[];
  }

  private async decrementLotRemaining(
    consumption: LotConsumption,
  ): Promise<void> {
    const { data: lot, error: fetchError } = await this.supabaseService
      .getClient()
      .from('product_lots')
      .select('quantity_remaining')
      .eq('id', consumption.lotId)
      .single();

    if (fetchError) {
      throw new InternalServerErrorException(fetchError.message);
    }

    const nextRemaining = Math.round(
      Number(lot.quantity_remaining) - consumption.quantity,
    );

    const { error: updateError } = await this.supabaseService
      .getClient()
      .from('product_lots')
      .update({ quantity_remaining: Math.max(0, nextRemaining) })
      .eq('id', consumption.lotId);

    if (updateError) {
      throw new InternalServerErrorException(updateError.message);
    }
  }
}
