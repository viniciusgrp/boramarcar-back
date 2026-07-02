import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { MulterError } from 'multer';
import { formatFileSize, MAX_FILE_SIZE_BYTES } from './upload.constants';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();

    let message =
      'Não foi possível processar o arquivo enviado. Verifique o formato e tente novamente.';

    if (exception.code === 'LIMIT_FILE_SIZE') {
      message = `A imagem excede o limite de ${formatFileSize(MAX_FILE_SIZE_BYTES)} no envio. Selecione outra foto ou aguarde a compressão automática no navegador.`;
    } else if (exception.code === 'LIMIT_UNEXPECTED_FILE') {
      message =
        'Campo de upload inválido. Use o botão "Escolher arquivo" para selecionar a imagem.';
    }

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message,
      error: 'Bad Request',
    });
  }
}
