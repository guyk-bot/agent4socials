import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SocialModule } from './social/social.module';
import { MediaModule } from './media/media.module';
import { PostsModule } from './posts/posts.module';
import { BullModule } from '@nestjs/bullmq';

const redisHost = process.env.REDIS_HOST || 'localhost';
const useTls =
  process.env.REDIS_TLS === 'true' ||
  process.env.REDIS_TLS === '1' ||
  redisHost.includes('upstash.io');

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    SocialModule,
    MediaModule,
    PostsModule,
    BullModule.forRoot({
      connection: {
        host: redisHost,
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        ...(process.env.REDIS_PASSWORD && {
          username: process.env.REDIS_USERNAME || 'default',
          password: process.env.REDIS_PASSWORD,
        }),
        ...(useTls && { tls: {} }),
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
