import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SocialService } from '../../social/social.service';
import { EncryptionService } from '../../social/encryption/encryption.service';
import { Platform, PostStatus } from '@prisma/client';
import axios from 'axios';

@Processor('post-publishing')
@Injectable()
export class ProcessorService extends WorkerHost {
    private readonly logger = new Logger(ProcessorService.name);

    constructor(
        private prisma: PrismaService,
        private encryptionService: EncryptionService,
        private socialService: SocialService,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        const { postId } = job.data;
        this.logger.log(`Processing post ${postId}`);

        const post = await this.prisma.post.findUnique({
            where: { id: postId },
            include: { media: true, targets: true },
        });

        if (!post || post.status !== PostStatus.SCHEDULED) {
            return;
        }

        await this.prisma.post.update({
            where: { id: postId },
            data: { status: PostStatus.POSTING },
        });

        for (const target of post.targets) {
            try {
                await this.publishToPlatform(post, target);
                await this.prisma.postTarget.update({
                    where: { id: target.id },
                    data: { status: PostStatus.POSTED },
                });
            } catch (error) {
                this.logger.error(`Failed to publish to ${target.platform}: ${error.message}`);
                await this.prisma.postTarget.update({
                    where: { id: target.id },
                    data: { status: PostStatus.FAILED, error: error.message },
                });
            }
        }

        // Check if all targets are finished
        const updatedPost = await this.prisma.post.findUnique({
            where: { id: postId },
            include: { targets: true },
        });

        if (!updatedPost) return;

        const anyFailed = updatedPost.targets.some((t) => t.status === PostStatus.FAILED);
        await this.prisma.post.update({
            where: { id: postId },
            data: { status: anyFailed ? PostStatus.FAILED : PostStatus.POSTED },
        });
    }

    private async publishToPlatform(post: any, target: any) {
        const account = await this.prisma.socialAccount.findUnique({
            where: { id: target.socialAccountId },
        });

        if (!account) throw new Error('Account not found');

        const accessToken = this.encryptionService.decrypt(account.accessToken);

        switch (target.platform) {
            case Platform.INSTAGRAM:
                return this.publishToInstagram(post, accessToken, account.platformUserId);
            case Platform.TIKTOK:
                return this.publishToTikTok(post, accessToken, account.platformUserId);
            case Platform.YOUTUBE:
                return this.publishToYouTube(post, accessToken, account.platformUserId);
            case Platform.FACEBOOK:
                return this.publishToFacebook(post, accessToken, account.platformUserId);
            case Platform.TWITTER:
                return this.publishToTwitter(post, accessToken, account.platformUserId);
            case Platform.LINKEDIN:
                return this.publishToLinkedIn(post, accessToken, account.platformUserId);
            default:
                throw new Error(`Unsupported platform: ${target.platform}`);
        }
    }

    private async publishToInstagram(post: any, token: string, igUserId: string) {
        // 1. Create Media Container
        // 2. Publish Container
        this.logger.log(`Publishing to Instagram for user ${igUserId}`);
        // implementation details for Instagram Graph API
    }

    private async publishToTikTok(post: any, token: string, openId: string) {
        this.logger.log(`Publishing to TikTok for user ${openId}`);
        // implementation details for TikTok Posting API
    }

    private async publishToYouTube(post: any, token: string, channelId: string) {
        this.logger.log(`Publishing to YouTube for channel ${channelId}`);
        // implementation details for YouTube Data API
    }

    private async publishToFacebook(post: any, token: string, pageId: string) {
        this.logger.log(`Publishing to Facebook for page ${pageId}`);
        // implementation details for Facebook Graph API (Pages)
    }

    private async publishToTwitter(post: any, token: string, userId: string) {
        this.logger.log(`Publishing to X (Twitter) for user ${userId}`);
        // implementation details for Twitter API v2
    }

    private async publishToLinkedIn(post: any, token: string, urn: string) {
        this.logger.log(`Publishing to LinkedIn for ${urn}`);
        // implementation details for LinkedIn Share API
    }
}
