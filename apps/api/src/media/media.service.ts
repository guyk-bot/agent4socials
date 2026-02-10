import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class MediaService {
    private s3Client: S3Client | null = null;
    private readonly isConfigured: boolean;

    constructor() {
        const endpoint = process.env.S3_ENDPOINT;
        const bucket = process.env.S3_BUCKET_NAME;
        const accessKey = process.env.S3_ACCESS_KEY_ID;
        const secretKey = process.env.S3_SECRET_ACCESS_KEY;
        this.isConfigured = !!(endpoint && bucket && accessKey && secretKey);

        if (this.isConfigured) {
            this.s3Client = new S3Client({
                region: process.env.S3_REGION || 'auto',
                credentials: { accessKeyId: accessKey!, secretAccessKey: secretKey! },
                endpoint,
                forcePathStyle: true,
            });
        }
    }

    async getUploadUrl(fileName: string, contentType: string) {
        if (!this.isConfigured || !this.s3Client) {
            throw new ServiceUnavailableException(
                'Media storage is not configured. Set S3_ENDPOINT, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.',
            );
        }
        const bucket = process.env.S3_BUCKET_NAME!;
        const key = `uploads/${randomUUID()}-${fileName}`;
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType,
        });

        try {
            const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
            const baseUrl = process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || '';
            return {
                uploadUrl: url,
                fileUrl: baseUrl ? `${baseUrl.replace(/\/$/, '')}/${bucket}/${key}` : key,
                key,
            };
        } catch (error) {
            console.error('Error generating signed URL:', error);
            throw new InternalServerErrorException('Could not generate upload URL');
        }
    }
}
