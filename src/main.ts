import './set-timezone';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SanitizedExceptionFilter } from './common/filters/sanitized-exception.filter';
import { MulterExceptionFilter } from './upload/multer-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.use(helmet());

  const isProduction = process.env.NODE_ENV === 'production';
  const rawOrigins = process.env.ALLOWED_ORIGINS?.trim();
  const allowedOrigins = rawOrigins
    ? rawOrigins.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  const corsAllowAll =
    !isProduction &&
    (allowedOrigins.length === 0 || allowedOrigins.includes('*'));

  if (isProduction) {
    if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
      throw new Error(
        'ALLOWED_ORIGINS must be an explicit comma-separated allowlist in production (wildcard * is not allowed).',
      );
    }
  }

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || corsAllowAll || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS bloqueado para origem: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalFilters(
    new SanitizedExceptionFilter(),
    new MulterExceptionFilter(),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = Number(process.env.PORT) || 3333;
  await app.listen(port);
}

bootstrap();
