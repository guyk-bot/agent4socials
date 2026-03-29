import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { type Request, type Response } from 'express';

let cachedApp: INestApplication | null = null;

async function getExpressApp() {
  if (cachedApp) {
    return cachedApp.getHttpAdapter().getInstance();
  }
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');
  await app.init();
  cachedApp = app;
  return app.getHttpAdapter().getInstance();
}

export default async function handler(req: Request, res: Response) {
  try {
    const rawPath = (req as any).url || (req as any).path || '/';
    const path = (typeof rawPath === 'string' ? rawPath : '/').split('?')[0];
    if (!path.startsWith('/api')) {
      (req as any).url = '/api' + (path === '/' ? '' : path);
    }
    const expressApp = await getExpressApp();
    expressApp(req, res);
  } catch (err) {
    console.error('Vercel serverless handler error:', err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'FUNCTION_INVOCATION_FAILED',
        message,
        ...(process.env.VERCEL_ENV === 'development' && stack && { stack }),
      })
    );
  }
}
