import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS (allow comma-separated origins for prod + local)
  const origins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((o) => o.trim());
  app.enableCors({
    origin: origins.length ? origins : ['http://localhost:3000'],
    credentials: true,
  });

  // Enable validation globally
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Set global prefix
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 API is running on: http://localhost:${port}/api`);
}
bootstrap();
