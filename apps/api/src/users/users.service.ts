import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma, AuthProvider } from '@prisma/client';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async findOneBySupabaseId(supabaseId: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { supabaseId },
        });
    }

    async findOneByEmail(email: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { email },
        });
    }

    /** Find user by Supabase id, or create one from Supabase JWT payload (email, name). */
    async findOrCreateBySupabaseId(supabaseId: string, email: string, name?: string, provider: AuthProvider = AuthProvider.LOCAL): Promise<User> {
        let user = await this.findOneBySupabaseId(supabaseId);
        if (user) return user;
        user = await this.findOneByEmail(email);
        if (user) {
            await this.prisma.user.update({
                where: { id: user.id },
                data: { supabaseId, name: name ?? user.name },
            });
            return this.findOneBySupabaseId(supabaseId) as Promise<User>;
        }
        return this.prisma.user.create({
            data: {
                supabaseId,
                email,
                name: name ?? null,
                provider,
                password: null,
            },
        });
    }

    async findOneById(id: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { id },
        });
    }

    async create(data: Prisma.UserCreateInput): Promise<User> {
        return this.prisma.user.create({
            data,
        });
    }

    async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
        return this.prisma.user.update({
            where: { id },
            data,
        });
    }
}
