import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Platform, SocialAccount } from '@prisma/client';
import { EncryptionService } from './encryption/encryption.service';
import axios from 'axios';

@Injectable()
export class SocialService {
    constructor(
        private prisma: PrismaService,
        private encryptionService: EncryptionService,
    ) { }

    async getOAuthUrl(platform: Platform, userId: string): Promise<string> {
        const state = userId; // In production, use a signed state or session-linked value

        switch (platform) {
            case Platform.INSTAGRAM:
                return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${process.env.META_REDIRECT_URI}&state=${state}&scope=instagram_basic,instagram_content_publish,pages_read_engagement`;
            case Platform.TIKTOK:
                return `https://www.tiktok.com/v2/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY}&scope=user.info.basic,video.upload,video.publish&response_type=code&redirect_uri=${process.env.TIKTOK_REDIRECT_URI}&state=${state}`;
            case Platform.YOUTUBE:
                return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.YOUTUBE_CLIENT_ID}&redirect_uri=${process.env.YOUTUBE_REDIRECT_URI}&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly&access_type=offline&state=${state}&prompt=consent`;
            default:
                throw new BadRequestException('Unsupported platform');
        }
    }

    async handleCallback(platform: Platform, code: string, state: string) {
        const userId = state; // userId passed back in state
        let tokenData: any;

        try {
            if (platform === Platform.INSTAGRAM) {
                tokenData = await this.exchangeInstagramCode(code);
            } else if (platform === Platform.TIKTOK) {
                tokenData = await this.exchangeTikTokCode(code);
            } else if (platform === Platform.YOUTUBE) {
                tokenData = await this.exchangeYouTubeCode(code);
            }
        } catch (error) {
            console.error(`Error exchanging code for ${platform}:`, error.response?.data || error.message);
            throw new InternalServerErrorException(`Failed to connect ${platform} account`);
        }

        const { accessToken, refreshToken, expiresAt, platformUserId, username } = tokenData;

        const encryptedAccessToken = this.encryptionService.encrypt(accessToken);
        const encryptedRefreshToken = refreshToken ? this.encryptionService.encrypt(refreshToken) : null;

        return this.prisma.socialAccount.upsert({
            where: {
                userId_platform_platformUserId: {
                    userId,
                    platform,
                    platformUserId,
                },
            },
            update: {
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                expiresAt,
                username,
                status: 'connected',
            },
            create: {
                userId,
                platform,
                platformUserId,
                username,
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                expiresAt,
                status: 'connected',
            },
        });
    }

    private async exchangeInstagramCode(code: string) {
        // 1. Exchange short-lived token for long-lived token
        // This is a simplification; Meta flow usually involves FB Login + Page selection
        // In a real app, you'd handle the multi-step process.
        const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: {
                client_id: process.env.META_APP_ID,
                client_secret: process.env.META_APP_SECRET,
                redirect_uri: process.env.META_REDIRECT_URI,
                code,
            },
        });

        return {
            accessToken: response.data.access_token,
            refreshToken: null,
            expiresAt: new Date(Date.now() + (response.data.expires_in || 3600) * 1000),
            platformUserId: 'temp-id', // Would be fetched via /me
            username: 'temp-user',
        };
    }

    private async exchangeTikTokCode(code: string) {
        const response = await axios.post('https://open-api.tiktok.com/oauth/access_token/', {
            client_key: process.env.TIKTOK_CLIENT_KEY,
            client_secret: process.env.TIKTOK_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
        });

        return {
            accessToken: response.data.data.access_token,
            refreshToken: response.data.data.refresh_token,
            expiresAt: new Date(Date.now() + response.data.data.expires_in * 1000),
            platformUserId: response.data.data.open_id,
            username: 'TikTok User',
        };
    }

    private async exchangeYouTubeCode(code: string) {
        const response = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: process.env.YOUTUBE_CLIENT_ID,
            client_secret: process.env.YOUTUBE_CLIENT_SECRET,
            code,
            redirect_uri: process.env.YOUTUBE_REDIRECT_URI,
            grant_type: 'authorization_code',
        });

        return {
            accessToken: response.data.access_token,
            refreshToken: response.data.refresh_token,
            expiresAt: new Date(Date.now() + response.data.expires_in * 1000),
            platformUserId: 'youtube-id', // Would be fetched via channel lookup
            username: 'YouTube Channel',
        };
    }

    async getAccounts(userId: string) {
        return this.prisma.socialAccount.findMany({
            where: { userId },
            select: {
                id: true,
                platform: true,
                username: true,
                status: true,
                updatedAt: true,
            },
        });
    }
}
