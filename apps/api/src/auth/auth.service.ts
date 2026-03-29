import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { AuthProvider, User } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
    ) { }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.usersService.findOneByEmail(email);
        if (user && user.password && (await bcrypt.compare(pass, user.password))) {
            const { password, ...result } = user;
            return result;
        }
        return null;
    }

    async login(user: any) {
        const payload = { email: user.email, sub: user.id };
        return {
            access_token: this.jwtService.sign(payload),
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
        };
    }

    async register(email: string, pass: string, name?: string) {
        const existingUser = await this.usersService.findOneByEmail(email);
        if (existingUser) {
            throw new ConflictException('User already exists');
        }

        const hashedPassword = await bcrypt.hash(pass, 10);
        const user = await this.usersService.create({
            email,
            password: hashedPassword,
            name,
            provider: AuthProvider.LOCAL,
        });

        return this.login(user);
    }

    async validateOAuthUser(profile: any, provider: AuthProvider) {
        const { email, name, picture, id: platformUserId } = profile;
        let user = await this.usersService.findOneByEmail(email);

        if (!user) {
            user = await this.usersService.create({
                email,
                name,
                provider,
                // Profile picture could be saved here if we extend the user model
            });
        }

        return this.login(user);
    }
}
