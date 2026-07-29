import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ALLOWED_MIME_TYPES,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  MIME_TO_EXTENSION,
  STORAGE_BUCKET,
} from './upload.constants';

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

const SHARP_FORMAT_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async uploadImage(
    tenantId: string,
    file: UploadedImageFile | undefined,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException(
        'Nenhum arquivo enviado. Selecione uma imagem e tente novamente.',
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `A imagem tem ${formatFileSize(file.size)} e o limite é ${formatFileSize(MAX_FILE_SIZE_BYTES)}. Reduza o tamanho ou use outra foto.`,
      );
    }

    const detectedMime = await this.detectImageMime(file.buffer);

    if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
      throw new BadRequestException(
        'Formato inválido. Envie PNG, JPG, WebP ou GIF.',
      );
    }

    const extension = MIME_TO_EXTENSION[detectedMime] ?? 'jpg';
    const objectPath = `${tenantId}/${randomUUID()}-${Date.now()}.${extension}`;

    const { error } = await this.supabaseService
      .getClient()
      .storage.from(STORAGE_BUCKET)
      .upload(objectPath, file.buffer, {
        contentType: detectedMime,
        upsert: false,
      });

    if (error) {
      throw this.mapStorageError(error.message);
    }

    const { data } = this.supabaseService
      .getClient()
      .storage.from(STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    return { url: data.publicUrl };
  }

  private async detectImageMime(buffer: Buffer): Promise<string | null> {
    try {
      const meta = await sharp(buffer, { animated: true }).metadata();
      if (!meta.format) {
        return null;
      }

      return SHARP_FORMAT_TO_MIME[meta.format] ?? null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Image magic-byte validation failed: ${message}`);
      return null;
    }
  }

  private mapStorageError(message: string): BadRequestException | InternalServerErrorException {
    const normalized = message.toLowerCase();

    if (
      normalized.includes('payload too large') ||
      normalized.includes('file_size_limit') ||
      normalized.includes('maximum size')
    ) {
      return new BadRequestException(
        `A imagem excede o limite de ${formatFileSize(MAX_FILE_SIZE_BYTES)} do armazenamento.`,
      );
    }

    if (
      normalized.includes('mime') ||
      normalized.includes('content type') ||
      normalized.includes('not allowed')
    ) {
      return new BadRequestException(
        'Formato não aceito pelo armazenamento. Use PNG, JPG, WebP ou GIF.',
      );
    }

    this.logger.error(`Storage upload failed: ${message}`);
    return new InternalServerErrorException(
      'Não foi possível salvar a imagem no armazenamento.',
    );
  }
}
