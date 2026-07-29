import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  ExpiringLotAlert,
  InventoryAlertsResponse,
  Product,
  ProductWithAlerts,
} from './entities/product.entity';
import {
  calculateProductMarginPercent,
  isProductLowStock,
} from './utils/low-stock.util';

const EXPIRY_ALERT_WINDOW_DAYS = 30;

interface ProductRow extends Product {
  product_categories?: { name: string } | { name: string }[] | null;
}

@Injectable()
export class ProductsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAllManagedByTenant(tenantId: string): Promise<ProductWithAlerts[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('products')
      .select('*, product_categories(name)')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => this.mapProductRow(row as ProductRow));
  }

  async findActiveByTenant(tenantId: string): Promise<ProductWithAlerts[]> {
    const products = await this.findAllManagedByTenant(tenantId);
    return products.filter((product) => product.is_active);
  }

  async getAlertsForTenant(tenantId: string): Promise<InventoryAlertsResponse> {
    const products = await this.findAllManagedByTenant(tenantId);
    const lowStockProducts = products.filter(
      (product) => product.is_active && product.isLowStock,
    );

    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + EXPIRY_ALERT_WINDOW_DAYS);
    const windowEndIso = windowEnd.toISOString().slice(0, 10);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('product_lots')
      .select('id, lot_number, expiry_date, quantity_remaining, product_id, products(name, tenant_id, is_active)')
      .eq('tenant_id', tenantId)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', windowEndIso)
      .gt('quantity_remaining', 0)
      .order('expiry_date', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const expiringLots: ExpiringLotAlert[] = (data ?? [])
      .map((row) => {
        const productRelation = row.products as
          | { name: string; is_active: boolean }
          | { name: string; is_active: boolean }[]
          | null;
        const product = Array.isArray(productRelation)
          ? productRelation[0]
          : productRelation;

        if (!product || product.is_active === false) {
          return null;
        }

        return {
          productId: row.product_id as string,
          productName: product.name,
          lotId: row.id as string,
          lotNumber: row.lot_number as string | null,
          expiryDate: row.expiry_date as string,
          quantityRemaining: Number(row.quantity_remaining ?? 0),
        };
      })
      .filter((item): item is ExpiringLotAlert => item !== null);

    return { lowStockProducts, expiringLots };
  }

  async createForTenant(
    tenantId: string,
    dto: CreateProductDto,
  ): Promise<ProductWithAlerts> {
    await this.assertNoDuplicateSkuOrBarcode(tenantId, dto.sku, dto.barcode);

    const { data, error } = await this.supabaseService
      .getClient()
      .from('products')
      .insert({
        tenant_id: tenantId,
        category_id: dto.categoryId?.trim() || null,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        sku: dto.sku?.trim() || null,
        barcode: dto.barcode?.trim() || null,
        unit: dto.unit ?? 'UN',
        cost_price: dto.costPrice ?? 0,
        sale_price: dto.salePrice,
        current_stock: 0,
        min_stock_alert: dto.minStockAlert ?? 0,
        track_lots: dto.trackLots ?? false,
        custom_commission_rate: dto.customCommissionRate ?? null,
        image_url: dto.imageUrl?.trim() || null,
        is_active: dto.isActive ?? true,
      })
      .select('*, product_categories(name)')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapProductRow(data as ProductRow);
  }

  async updateForTenant(
    tenantId: string,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<ProductWithAlerts> {
    await this.assertProductBelongsToTenant(productId, tenantId);

    if (dto.sku !== undefined || dto.barcode !== undefined) {
      await this.assertNoDuplicateSkuOrBarcode(
        tenantId,
        dto.sku ?? undefined,
        dto.barcode ?? undefined,
        productId,
      );
    }

    const payload: Record<string, string | number | boolean | null> = {};

    if (dto.name !== undefined) payload.name = dto.name.trim();
    if (dto.description !== undefined) payload.description = dto.description?.trim() || null;
    if (dto.categoryId !== undefined) payload.category_id = dto.categoryId?.trim() || null;
    if (dto.sku !== undefined) payload.sku = dto.sku?.trim() || null;
    if (dto.barcode !== undefined) payload.barcode = dto.barcode?.trim() || null;
    if (dto.unit !== undefined) payload.unit = dto.unit;
    if (dto.costPrice !== undefined) payload.cost_price = dto.costPrice;
    if (dto.salePrice !== undefined) payload.sale_price = dto.salePrice;
    if (dto.minStockAlert !== undefined) payload.min_stock_alert = dto.minStockAlert;
    if (dto.trackLots !== undefined) payload.track_lots = dto.trackLots;
    if (dto.customCommissionRate !== undefined) payload.custom_commission_rate = dto.customCommissionRate;
    if (dto.imageUrl !== undefined) payload.image_url = dto.imageUrl?.trim() || null;
    if (dto.isActive !== undefined) payload.is_active = dto.isActive;

    payload.updated_at = new Date().toISOString();

    const { data, error } = await this.supabaseService
      .getClient()
      .from('products')
      .update(payload)
      .eq('id', productId)
      .eq('tenant_id', tenantId)
      .select('*, product_categories(name)')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return this.mapProductRow(data as ProductRow);
  }

  async softDeleteForTenant(
    tenantId: string,
    productId: string,
  ): Promise<ProductWithAlerts> {
    return this.updateForTenant(tenantId, productId, { isActive: false });
  }

  async assertProductBelongsToTenant(
    productId: string,
    tenantId: string,
  ): Promise<Product> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException(
        `Product with id "${productId}" was not found for this tenant`,
      );
    }

    return data as Product;
  }

  /** Ajusta o cache de estoque e recalcula o custo médio após uma entrada. */
  async applyStockDelta(
    tenantId: string,
    productId: string,
    quantityDelta: number,
    newAverageCostPrice?: number,
  ): Promise<void> {
    const product = await this.assertProductBelongsToTenant(productId, tenantId);
    const nextStock = Math.round((Number(product.current_stock) + quantityDelta) * 1000) / 1000;

    if (nextStock < 0) {
      throw new BadRequestException(
        `Estoque insuficiente para "${product.name}". Disponível: ${product.current_stock}.`,
      );
    }

    const payload: Record<string, number | string> = {
      current_stock: nextStock,
      updated_at: new Date().toISOString(),
    };

    if (newAverageCostPrice !== undefined) {
      payload.cost_price = newAverageCostPrice;
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('products')
      .update(payload)
      .eq('id', productId)
      .eq('tenant_id', tenantId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private async assertNoDuplicateSkuOrBarcode(
    tenantId: string,
    sku?: string | null,
    barcode?: string | null,
    excludeProductId?: string,
  ): Promise<void> {
    const normalizedSku = sku?.trim() || null;
    const normalizedBarcode = barcode?.trim() || null;

    if (!normalizedSku && !normalizedBarcode) {
      return;
    }

    let query = this.supabaseService
      .getClient()
      .from('products')
      .select('id, sku, barcode')
      .eq('tenant_id', tenantId);

    if (excludeProductId) {
      query = query.neq('id', excludeProductId);
    }

    const orFilters: string[] = [];
    if (normalizedSku) orFilters.push(`sku.eq.${normalizedSku}`);
    if (normalizedBarcode) orFilters.push(`barcode.eq.${normalizedBarcode}`);

    const { data, error } = await query.or(orFilters.join(','));

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (data && data.length > 0) {
      throw new ConflictException(
        'Já existe um produto com este SKU ou código de barras.',
      );
    }
  }

  private mapProductRow(row: ProductRow): ProductWithAlerts {
    const categoryRelation = row.product_categories;
    const category = Array.isArray(categoryRelation)
      ? categoryRelation[0]
      : categoryRelation;
    const currentStock = Number(row.current_stock ?? 0);
    const costPrice = Number(row.cost_price ?? 0);
    const salePrice = Number(row.sale_price ?? 0);
    const minStockAlert = Number(row.min_stock_alert ?? 0);

    return {
      ...row,
      cost_price: costPrice,
      sale_price: salePrice,
      current_stock: currentStock,
      min_stock_alert: minStockAlert,
      custom_commission_rate:
        row.custom_commission_rate === null || row.custom_commission_rate === undefined
          ? null
          : Number(row.custom_commission_rate),
      isLowStock: isProductLowStock(currentStock, minStockAlert),
      marginPercent: calculateProductMarginPercent(costPrice, salePrice),
      categoryName: category?.name ?? null,
    };
  }
}
