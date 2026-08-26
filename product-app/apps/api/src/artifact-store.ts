import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface ArtifactStore {
  put(key: string, value: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly root: string) {}

  private pathFor(key: string) {
    const safe = key
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("/");
    return resolve(this.root, safe);
  }

  async put(key: string, value: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, value, { mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

class S3ArtifactStore implements ArtifactStore {
  private readonly client: S3Client;
  constructor(
    endpoint: string,
    private readonly bucket: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.client = new S3Client({
      endpoint,
      region: process.env.OBJECT_STORAGE_REGION ?? "auto",
      forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE !== "false",
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(key: string, value: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: value,
        ContentType: contentType,
        ServerSideEncryption:
          process.env.OBJECT_STORAGE_SSE === "none" ? undefined : "AES256",
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) throw new Error("REPORT_ARTIFACT_BODY_MISSING");
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

export function createArtifactStore(): ArtifactStore {
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  const accessKey = process.env.OBJECT_STORAGE_ACCESS_KEY;
  const secretKey = process.env.OBJECT_STORAGE_SECRET_KEY;
  if (endpoint && bucket && accessKey && secretKey)
    return new S3ArtifactStore(endpoint, bucket, accessKey, secretKey);
  if (process.env.NODE_ENV === "production")
    throw new Error("OBJECT_STORAGE_CONFIGURATION_REQUIRED");
  return new LocalArtifactStore(
    resolve(
      process.cwd(),
      process.env.ARTIFACT_STORAGE_PATH ?? ".data/artifacts",
    ),
  );
}
