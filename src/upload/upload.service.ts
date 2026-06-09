import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';

const STORAGE_BUCKET = 'boramarcar-assets';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class UploadService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async uploadImage(
    tenantId: string,
    file: UploadedImageFile | undefined,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Formato inválido. Envie uma imagem PNG, JPG, WebP ou GIF.',
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('A imagem deve ter no máximo 5 MB.');
    }

    const extension = MIME_TO_EXTENSION[file.mimetype] ?? 'jpg';
    const objectPath = `${tenantId}/${randomUUID()}-${Date.now()}.${extension}`;

    const { error } = await this.supabaseService
      .getClient()
      .storage.from(STORAGE_BUCKET)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Não foi possível enviar a imagem: ${error.message}`,
      );
    }

    const { data } = this.supabaseService
      .getClient()
      .storage.from(STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    return { url: data.publicUrl };
  }
}
