import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { ProductJob } from "@ai-readiness/contracts";

export interface ProductJobQueue {
  add(job: ProductJob, idempotencyKey?: string): Promise<string>;
  close(): Promise<void>;
}

export function createProductJobQueue(
  redisUrl = process.env.REDIS_URL,
): ProductJobQueue | null {
  if (!redisUrl) return null;
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue("ai-readiness-jobs", { connection });
  return {
    async add(job, idempotencyKey) {
      const queued = await queue.add(job.name, job.data, {
        jobId: idempotencyKey,
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1_000 },
      });
      return String(queued.id);
    },
    async close() {
      await queue.close();
      await connection.quit();
    },
  };
}
