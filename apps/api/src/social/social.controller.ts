import { Controller, Get, Query, UseGuards, Request, Param, Redirect, BadRequestException } from '@nestjs/common';
import { SocialService } from './social.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Platform } from '@prisma/client';

@Controller('social')
export class SocialController {
    constructor(private socialService: SocialService) { }

    @UseGuards(JwtAuthGuard)
    @Get('oauth/:platform/start')
    @Redirect()
    async startOAuth(@Request() req, @Param('platform') platform: string) {
        const userId = req.user.userId;
        const plat = platform.toUpperCase() as Platform;

        if (!Object.values(Platform).includes(plat)) {
            throw new BadRequestException('Invalid platform');
        }

        const url = await this.socialService.getOAuthUrl(plat, userId);
        return { url };
    }

    @Get('oauth/:platform/callback')
    async callback(
        @Param('platform') platform: string,
        @Query('code') code: string,
        @Query('state') state: string, // state will contain the userId or a session token
    ) {
        const plat = platform.toUpperCase() as Platform;
        await this.socialService.handleCallback(plat, code, state);
        return 'Account connected successfully! You can close this window.';
    }

    @UseGuards(JwtAuthGuard)
    @Get('accounts')
    async getAccounts(@Request() req) {
        return this.socialService.getAccounts(req.user.userId);
    }
}
