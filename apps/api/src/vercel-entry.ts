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
  const app = await NestFactory.create(AppModule);
  const origins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((o: string) => o.trim());
  app.enableCors({
    origin: origins.length ? origins : ['http://localhost:3000'],
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
  const expressApp = await getExpressApp();
  expressApp(req, res);
}
