import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
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

@Injectable()
export class UploadService {
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

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Formato inválido (${file.mimetype || 'desconhecido'}). Envie PNG, JPG, WebP ou GIF.`,
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `A imagem tem ${formatFileSize(file.size)} e o limite é ${formatFileSize(MAX_FILE_SIZE_BYTES)}. Reduza o tamanho ou use outra foto.`,
      );
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
      throw this.mapStorageError(error.message);
    }

    const { data } = this.supabaseService
      .getClient()
      .storage.from(STORAGE_BUCKET)
      .getPublicUrl(objectPath);

    return { url: data.publicUrl };
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

    return new InternalServerErrorException(
      `Não foi possível salvar a imagem no armazenamento: ${message}`,
    );
  }
}
