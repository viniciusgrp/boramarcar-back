import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import { Roles } from '../tenants/decorators/roles.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { CreateGuestReviewDto } from './dto/create-guest-review.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import type {
  CustomerReview,
  CustomerReviewStatus,
} from './entities/customer-review.entity';
import type {
  AdminReviewItem,
  PublicReviewsResponse,
} from './entities/review-list.entity';
import { ReviewsService } from './reviews.service';

const REVIEW_STATUSES: CustomerReviewStatus[] = [
  'PENDING',
  'PUBLISHED',
  'HIDDEN',
  'REJECTED',
];

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('public/:tenantId')
  async findPublic(
    @Param('tenantId') tenantId: string,
  ): Promise<PublicReviewsResponse> {
    return this.reviewsService.findPublicByTenantId(tenantId);
  }

  @Post()
  @UseGuards(AuthGuard)
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateReviewDto,
  ): Promise<CustomerReview> {
    return this.reviewsService.createForCustomer(user.id, dto);
  }

  @Post('guest')
  async createGuest(
    @Body() dto: CreateGuestReviewDto,
  ): Promise<CustomerReview> {
    return this.reviewsService.createForGuest(dto);
  }

  @Get()
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async findAll(
    @CurrentTenantContext() context: TenantAccessContext,
    @Query('status') status?: string,
  ): Promise<AdminReviewItem[]> {
    const normalized = status?.trim().toUpperCase();
    const filter =
      normalized && REVIEW_STATUSES.includes(normalized as CustomerReviewStatus)
        ? (normalized as CustomerReviewStatus)
        : undefined;

    if (status?.trim() && !filter) {
      throw new BadRequestException('Status de avaliação inválido.');
    }

    return this.reviewsService.findAllForTenant(context.tenant.id, filter);
  }

  @Patch(':id/publish')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async publish(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<CustomerReview> {
    return this.reviewsService.publishForTenant(
      context.tenant.id,
      id,
      user.id,
    );
  }

  @Patch(':id/reject')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async reject(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<CustomerReview> {
    return this.reviewsService.rejectForTenant(
      context.tenant.id,
      id,
      user.id,
    );
  }

  @Patch(':id/hide')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN')
  async hide(
    @CurrentTenantContext() context: TenantAccessContext,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<CustomerReview> {
    return this.reviewsService.hideForTenant(context.tenant.id, id, user.id);
  }
}
