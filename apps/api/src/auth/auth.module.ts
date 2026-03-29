import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [UsersModule, PassportModule],
  providers: [JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule { }
