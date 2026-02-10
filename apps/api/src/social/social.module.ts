import { Module } from '@nestjs/common';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';
import { CapabilityMatrixService } from './capability-matrix/capability-matrix.service';
import { EncryptionService } from './encryption/encryption.service';

@Module({
  providers: [SocialService, CapabilityMatrixService, EncryptionService],
  controllers: [SocialController],
  exports: [SocialService, EncryptionService],
})
export class SocialModule { }
