import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
    private readonly algorithm = 'aes-256-gcm';
    private readonly key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-secret-key-32-chars-long!!', 'salt', 32);

    encrypt(text: string): string {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
        const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([iv, tag, encrypted]).toString('base64');
    }

    decrypt(data: string): string {
        const buffer = Buffer.from(data, 'base64');
        const iv = buffer.subarray(0, 12);
        const tag = buffer.subarray(12, 28);
        const encrypted = buffer.subarray(28);
        const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    }
}
