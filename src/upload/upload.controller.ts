import {
  BadRequestException,
  Controller,
  NotFoundException,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { User } from '@supabase/supabase-js';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { resolveAuthUserId } from '../auth/utils/resolve-auth-user-id.util';
import { CustomersService } from '../customers/customers.service';
import { TenantAccessGuard } from '../tenants/guards/tenant-access.guard';
import { TenantsService } from '../tenants/tenants.service';
import { UploadService, type UploadedImageFile } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly tenantsService: TenantsService,
    private readonly customersService: CustomersService,
  ) {}

  @Post('customer')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadCustomerImage(
    @CurrentUser() user: User,
    @Query('tenantId') tenantId?: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<{ url: string }> {
    const trimmedTenantId = tenantId?.trim();

    if (!trimmedTenantId) {
      throw new BadRequestException('Query parameter "tenantId" is required');
    }

    const customerContext = await this.customersService.getMe(
      resolveAuthUserId(user),
      trimmedTenantId,
    );

    if (!customerContext.customer) {
      throw new NotFoundException('Perfil de cliente não encontrado.');
    }

    const payload: UploadedImageFile | undefined = file
      ? {
          buffer: file.buffer,
          mimetype: file.mimetype,
          size: file.size,
        }
      : undefined;

    return this.uploadService.uploadImage(trimmedTenantId, payload);
  }

  @Post()
  @UseGuards(AuthGuard, TenantAccessGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadImage(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ url: string }> {
    const tenant = await this.tenantsService.findByOwnerId(user.id);

    if (!tenant) {
      throw new NotFoundException(
        'No establishment linked to the authenticated user',
      );
    }

    const payload: UploadedImageFile | undefined = file
      ? {
          buffer: file.buffer,
          mimetype: file.mimetype,
          size: file.size,
        }
      : undefined;

    return this.uploadService.uploadImage(tenant.id, payload);
  }
}
