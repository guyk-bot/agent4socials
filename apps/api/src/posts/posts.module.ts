import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { SchedulerService } from './scheduler/scheduler.service';
import { ProcessorService } from './processor/processor.service';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'post-publishing',
    }),
    PrismaModule,
    SocialModule,
  ],
  providers: [PostsService, SchedulerService, ProcessorService],
  controllers: [PostsController],
})
export class PostsModule { }
