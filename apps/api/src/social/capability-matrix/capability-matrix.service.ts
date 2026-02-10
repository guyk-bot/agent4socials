import { Injectable } from '@nestjs/common';
import { Platform } from '@prisma/client';

export interface PlatformCapabilities {
    supportsAutoPublish: boolean;
    maxVideoDuration: number; // in seconds
    maxImageSize: number; // in bytes
    allowedVideoFormats: string[];
    allowedImageFormats: string[];
    requiresBusinessAccount: boolean;
}

@Injectable()
export class CapabilityMatrixService {
    private readonly matrix: Record<Platform, PlatformCapabilities> = {
        [Platform.INSTAGRAM]: {
            supportsAutoPublish: true,
            maxVideoDuration: 90, // Reels
            maxImageSize: 8 * 1024 * 1024,
            allowedVideoFormats: ['video/mp4', 'video/quicktime'],
            allowedImageFormats: ['image/jpeg', 'image/png'],
            requiresBusinessAccount: true,
        },
        [Platform.TIKTOK]: {
            supportsAutoPublish: true, // If using Content Posting API
            maxVideoDuration: 600,
            maxImageSize: 0, // TikTok is primarily video
            allowedVideoFormats: ['video/mp4', 'video/webm'],
            allowedImageFormats: [],
            requiresBusinessAccount: false,
        },
        [Platform.YOUTUBE]: {
            supportsAutoPublish: true,
            maxVideoDuration: 12 * 3600,
            maxImageSize: 2 * 1024 * 1024,
            allowedVideoFormats: ['video/mp4', 'video/quicktime', 'video/x-msvideo'],
            allowedImageFormats: ['image/jpeg', 'image/png'],
            requiresBusinessAccount: false,
        },
        [Platform.FACEBOOK]: {
            supportsAutoPublish: true,
            maxVideoDuration: 240,
            maxImageSize: 4 * 1024 * 1024,
            allowedVideoFormats: ['video/mp4', 'video/quicktime'],
            allowedImageFormats: ['image/jpeg', 'image/png', 'image/gif'],
            requiresBusinessAccount: false,
        },
        [Platform.TWITTER]: {
            supportsAutoPublish: true,
            maxVideoDuration: 140,
            maxImageSize: 5 * 1024 * 1024,
            allowedVideoFormats: ['video/mp4'],
            allowedImageFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            requiresBusinessAccount: false,
        },
        [Platform.LINKEDIN]: {
            supportsAutoPublish: true,
            maxVideoDuration: 600,
            maxImageSize: 5 * 1024 * 1024,
            allowedVideoFormats: ['video/mp4'],
            allowedImageFormats: ['image/jpeg', 'image/png', 'image/gif'],
            requiresBusinessAccount: false,
        },
    };

    getCapabilities(platform: Platform): PlatformCapabilities {
        return this.matrix[platform];
    }

    isActionAllowed(platform: Platform, action: keyof PlatformCapabilities): boolean {
        const capabilities = this.getCapabilities(platform);
        return !!capabilities[action];
    }
}
