import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { AuthProvider } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private usersService: UsersService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || 'change-me',
        });
    }

    async validate(payload: { sub: string; email?: string; user_metadata?: { full_name?: string; name?: string }; app_metadata?: { provider?: string } }) {
        if (!payload.sub) throw new UnauthorizedException();
        const email = payload.email ?? '';
        const name = payload.user_metadata?.full_name ?? payload.user_metadata?.name;
        const provider = payload.app_metadata?.provider === 'google' ? AuthProvider.GOOGLE : AuthProvider.LOCAL;
        const user = await this.usersService.findOrCreateBySupabaseId(payload.sub, email, name, provider);
        return { userId: user.id, email: user.email, name: user.name };
    }
}
