import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { ProductCategory } from './entities/product-category.entity';

@Injectable()
export class ProductCategoriesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async findAllByTenant(tenantId: string): Promise<ProductCategory[]> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('product_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as ProductCategory[];
  }

  async createForTenant(
    tenantId: string,
    dto: CreateProductCategoryDto,
  ): Promise<ProductCategory> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('product_categories')
      .insert({
        tenant_id: tenantId,
        name: dto.name.trim(),
        is_active: dto.isActive ?? true,
      })
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as ProductCategory;
  }

  async updateForTenant(
    tenantId: string,
    categoryId: string,
    dto: UpdateProductCategoryDto,
  ): Promise<ProductCategory> {
    await this.assertBelongsToTenant(categoryId, tenantId);

    const payload: Record<string, string | boolean> = {};

    if (dto.name !== undefined) {
      payload.name = dto.name.trim();
    }

    if (dto.isActive !== undefined) {
      payload.is_active = dto.isActive;
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('product_categories')
      .update(payload)
      .eq('id', categoryId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as ProductCategory;
  }

  private async assertBelongsToTenant(
    categoryId: string,
    tenantId: string,
  ): Promise<ProductCategory> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('product_categories')
      .select('*')
      .eq('id', categoryId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new NotFoundException(
        `Product category with id "${categoryId}" was not found for this tenant`,
      );
    }

    return data as ProductCategory;
  }
}
