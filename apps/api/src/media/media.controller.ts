import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('media')
export class MediaController {
    constructor(private mediaService: MediaService) { }

    @UseGuards(JwtAuthGuard)
    @Post('upload-url')
    async getUploadUrl(
        @Body('fileName') fileName: string,
        @Body('contentType') contentType: string,
    ) {
        return this.mediaService.getUploadUrl(fileName, contentType);
    }
}
