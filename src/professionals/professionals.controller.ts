import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentTenantContext } from '../tenants/decorators/current-tenant-context.decorator';
import { Roles } from '../tenants/decorators/roles.decorator';
import type { TenantAccessContext } from '../tenants/entities/tenant-access-context.entity';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { TenantsService } from '../tenants/tenants.service';
import { resolveLinkedProfessionalId, resolveScopedProfessionalId } from '../tenants/utils/tenant-user-scope.util';
import { CreateProfessionalDto } from './dto/create-professional.dto';
import { LinkOwnerProfessionalDto } from './dto/link-owner-professional.dto';
import { UpdateProfessionalSelfDto } from './dto/update-professional-self.dto';
import { UpdateProfessionalDto } from './dto/update-professional.dto';
import { Professional } from './entities/professional.entity';
import type { OwnerProfessionalMembershipResponse } from './entities/owner-professional-membership-response.entity';
import { ProfessionalsService } from './professionals.service';

@Controller('professionals')
export class ProfessionalsController {
  constructor(
    private readonly professionalsService: ProfessionalsService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get()
  async findAllByTenant(
    @Query('tenantId') tenantId?: string,
  ): Promise<Professional[]> {
    if (!tenantId) {
      throw new BadRequestException('Query parameter "tenantId" is required');
    }

    return this.professionalsService.findAllByTenant(tenantId);
  }

  @Get('agenda')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async findForAgenda(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<Professional[]> {
    const professionals = await this.professionalsService.findAllByTenant(
      context.tenant.id,
    );
    const activeProfessionals = professionals.filter((item) => item.is_active);
    const scopedProfessionalId = resolveScopedProfessionalId(
      context.tenantUser,
    );

    if (!scopedProfessionalId) {
      return activeProfessionals;
    }

    return activeProfessionals.filter(
      (item) => item.id === scopedProfessionalId,
    );
  }

  @Get('me')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async findMyProfile(
    @CurrentTenantContext() context: TenantAccessContext,
  ): Promise<Professional | null> {
    const linkedProfessionalId = resolveLinkedProfessionalId(
      context.tenantUser,
    );

    if (!linkedProfessionalId) {
      return null;
    }

    return this.professionalsService.findOneWithServices(
      linkedProfessionalId,
      context.tenant.id,
    );
  }

  @Put('me')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER', 'ADMIN', 'PROFESSIONAL')
  async updateMyProfile(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: UpdateProfessionalSelfDto,
  ): Promise<Professional> {
    const linkedProfessionalId = resolveLinkedProfessionalId(
      context.tenantUser,
    );

    if (!linkedProfessionalId) {
      throw new BadRequestException(
        'Cadastre-se como profissional antes de editar o perfil de atendimento.',
      );
    }

    return this.professionalsService.updateForTenant(
      context.tenant.id,
      context.tenant.plan_tier,
      linkedProfessionalId,
      {
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        contactPhone: dto.contactPhone,
      },
    );
  }

  @Post('me/register')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER')
  async registerOwnerAsProfessional(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: CreateProfessionalDto,
  ): Promise<OwnerProfessionalMembershipResponse> {
    return this.professionalsService.registerOwnerAsProfessional(context, dto);
  }

  @Post('me/link')
  @UseGuards(AuthGuard, TenantAccessGuard, RolesGuard)
  @Roles('OWNER')
  async linkOwnerToExistingProfessional(
    @CurrentTenantContext() context: TenantAccessContext,
    @Body() dto: LinkOwnerProfessionalDto,
  ): Promise<OwnerProfessionalMembershipResponse> {
    return this.professionalsService.linkOwnerToExistingProfessional(
      context,
      dto.professionalId,
    );
  }

  @Get('managed')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async findManaged(
    @CurrentUser() user: User,
    @Query('archived') archived?: string,
  ): Promise<Professional[]> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.findAllManagedByTenant(tenant.id, {
      archived: archived === 'true' || archived === '1',
    });
  }

  @Get('managed/:id')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async findManagedOne(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<Professional> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.findOneWithServices(id, tenant.id);
  }

  @Post()
  @UseGuards(AuthGuard, TenantAccessGuard)
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateProfessionalDto,
  ): Promise<Professional> {
    if (!dto.name?.trim()) {
      throw new BadRequestException('Field "name" is required');
    }

    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.createForTenant(tenant.id, tenant.plan_tier, dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateProfessionalDto,
  ): Promise<Professional> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.updateForTenant(
      tenant.id,
      tenant.plan_tier,
      id,
      dto,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard, TenantAccessGuard)
  async archive(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<Professional> {
    const tenant = await this.resolveOwnerTenant(user.id);
    return this.professionalsService.archiveForTenant(tenant.id, id);
  }

  private async resolveOwnerTenant(userId: string) {
    const tenant = await this.tenantsService.findByOwnerId(userId);

    if (!tenant) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    return tenant;
  }
}
