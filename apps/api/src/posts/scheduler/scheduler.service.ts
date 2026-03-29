import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class SchedulerService {
    constructor(@InjectQueue('post-publishing') private postQueue: Queue) { }

    async schedulePost(postId: string, scheduledDate: Date) {
        const delay = scheduledDate.getTime() - Date.now();

        // Add a job for the post
        await this.postQueue.add(
            'publish-post',
            { postId },
            {
                delay: Math.max(0, delay),
                jobId: postId, // Ensure unique job per post
                removeOnComplete: true,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000 * 60, // 1 minute
                },
            },
        );
    }

    async cancelScheduledPost(postId: string) {
        const job = await this.postQueue.getJob(postId);
        if (job) {
            await job.remove();
        }
    }
}
