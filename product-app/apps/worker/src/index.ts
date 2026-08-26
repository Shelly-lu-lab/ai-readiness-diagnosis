import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { ProductJob } from "@ai-readiness/contracts";
import { createSqlClient, ProductRepository } from "@ai-readiness/database";
import { createProductJobProcessor } from "./processor.js";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.log("AI readiness worker is idle: REDIS_URL is not set.");
} else {
  const workerSecret = process.env.INTERNAL_WORKER_SECRET;
  if (!workerSecret || workerSecret.length < 32)
    throw new Error("INTERNAL_WORKER_SECRET_REQUIRED");
  const db = await createSqlClient();
  const repository = new ProductRepository(db);
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue("ai-readiness-jobs", { connection });
  const processor = createProductJobProcessor({
    repository,
    internalApiUrl: process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4310",
    workerSecret,
  });
  const worker = new Worker(
    "ai-readiness-jobs",
    (job: Job) => processor({ name: job.name, data: job.data } as ProductJob),
    {
      connection,
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
    },
  );
  const schedule = await queue.upsertJobScheduler(
    "close-due-campaigns",
    { every: 60_000 },
    {
      name: "close-due-campaigns",
      data: {},
      opts: { attempts: 5, backoff: { type: "exponential", delay: 2_000 } },
    },
  );
  const activationSchedule = await queue.upsertJobScheduler(
    "activate-due-campaigns",
    { every: 60_000 },
    {
      name: "activate-due-campaigns",
      data: {},
      opts: { attempts: 5, backoff: { type: "exponential", delay: 2_000 } },
    },
  );
  const completionReceiptSchedule = await queue.upsertJobScheduler(
    "process-completion-receipts",
    { every: 5 * 60_000 },
    {
      name: "process-completion-receipts",
      data: {},
      opts: { attempts: 5, backoff: { type: "exponential", delay: 2_000 } },
    },
  );
  console.log("AI readiness worker started", {
    activationScheduler: activationSchedule,
    closeScheduler: schedule,
    completionReceiptScheduler: completionReceiptSchedule,
  });
  worker.on("failed", (job, error) =>
    console.error("worker job failed", {
      jobId: job?.id,
      type: job?.name,
      message: error.message,
    }),
  );
  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
