import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from './scheduler/scheduler.service';
import { PostStatus, Prisma, Platform } from '@prisma/client';

@Injectable()
export class PostsService {
    constructor(
        private prisma: PrismaService,
        private schedulerService: SchedulerService,
    ) { }

    async createPost(userId: string, data: {
        title?: string;
        content?: string;
        media: { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[];
        targets: { platform: Platform; socialAccountId: string }[];
        scheduledAt?: string;
    }) {
        const post = await this.prisma.post.create({
            data: {
                userId,
                title: data.title,
                content: data.content,
                status: data.scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT,
                scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
                media: {
                    create: data.media.map((m) => ({
                        fileUrl: m.fileUrl,
                        type: m.type,
                    })),
                },
                targets: {
                    create: data.targets.map((t) => ({
                        platform: t.platform,
                        socialAccountId: t.socialAccountId,
                        status: data.scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT,
                    })),
                },
            },
            include: {
                media: true,
                targets: true,
            },
        });

        if (post.scheduledAt) {
            await this.schedulerService.schedulePost(post.id, post.scheduledAt);
        }

        return post;
    }

    async getPosts(userId: string) {
        return this.prisma.post.findMany({
            where: { userId },
            include: {
                media: true,
                targets: {
                    include: {
                        socialAccount: {
                            select: {
                                username: true,
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getPostById(id: string) {
        return this.prisma.post.findUnique({
            where: { id },
            include: {
                media: true,
                targets: true,
            },
        });
    }
}
