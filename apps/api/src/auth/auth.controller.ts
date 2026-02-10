import { Controller, UseGuards, Get, Request } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@Request() req: { user: { userId: string; email: string; name?: string | null } }) {
        return { id: req.user.userId, email: req.user.email, name: req.user.name ?? undefined };
    }
}
