import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { createSqlClient, SCHEMA_RELEASE } from "@ai-readiness/database";
import { createArtifactStore } from "../apps/api/src/artifact-store.js";
import { createProductJobQueue } from "../apps/api/src/job-queue.js";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_DEPENDENCY_TEST_CONFIG:${name}`);
  return value;
};
const retry = async <T>(work: () => Promise<T>, attempts = 30): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  throw lastError;
};

const databaseUrl = required("DATABASE_URL");
const redisUrl = required("REDIS_URL");
const endpoint = required("OBJECT_STORAGE_ENDPOINT");
const bucket = required("OBJECT_STORAGE_BUCKET");
const accessKeyId = required("OBJECT_STORAGE_ACCESS_KEY");
const secretAccessKey = required("OBJECT_STORAGE_SECRET_KEY");

const db = await retry(() => createSqlClient(databaseUrl));
try {
  const release = await db.query<{ release_id: string }>(
    "SELECT release_id FROM schema_releases WHERE release_id=$1",
    [SCHEMA_RELEASE],
  );
  assert.equal(release.rows[0]?.release_id, SCHEMA_RELEASE);
  await db.query(
    "INSERT INTO tenants (id,name) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name",
    ["dependency-smoke", "生产依赖验收"],
  );
} finally {
  await db.close();
}

const queueAdapter = createProductJobQueue(redisUrl);
assert.ok(queueAdapter);
const jobId = `dependency-smoke-${randomUUID()}`;
await retry(() =>
  queueAdapter.add(
    { name: "close-due-campaigns", data: { now: new Date().toISOString() } },
    jobId,
  ),
);
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue("ai-readiness-jobs", { connection: redis });
try {
  const job = await retry(async () => {
    const value = await queue.getJob(jobId);
    if (!value) throw new Error("QUEUED_JOB_NOT_VISIBLE");
    return value;
  });
  assert.equal(job.name, "close-due-campaigns");
  await job.remove();
} finally {
  await queue.close();
  await redis.quit();
  await queueAdapter.close();
}

const s3 = new S3Client({
  endpoint,
  region: process.env.OBJECT_STORAGE_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});
await retry(async () => {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
});
const store = createArtifactStore();
const key = `dependency-smoke/${randomUUID()}.txt`;
const value = Buffer.from("ai-readiness-production-dependencies-ok");
await store.put(key, value, "text/plain");
assert.deepEqual(await store.get(key), value);
await store.delete(key);
s3.destroy();

console.log("PRODUCTION_DEPENDENCIES_OK");
