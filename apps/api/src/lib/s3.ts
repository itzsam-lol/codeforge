/**
 * S3-compatible object storage (MinIO locally, AWS S3 in prod) for webcam
 * snapshots; media never goes into Postgres (spec Section 6).
 */
import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config";
import { logger } from "./logger";

const client = new S3Client({
  endpoint: config.s3.endpoint,
  region: "us-east-1", // MinIO ignores this but the SDK requires one
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: true, // required for MinIO
});

let bucketReady = false;

export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  try {
    await client.send(new CreateBucketCommand({ Bucket: config.s3.bucket }));
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(name)) {
      logger.error({ err }, "s3: bucket creation failed");
      throw err;
    }
  }
  bucketReady = true;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await ensureBucket();
  await client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

/** Short-lived read URL for the recruiter UI (snapshots are never public). */
export async function presignGet(key: string, expiresInSeconds = 900): Promise<string> {
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

/** Permanently deletes an object (spec 8 retention: purge expired snapshots). */
export async function deleteObject(key: string): Promise<void> {
  await ensureBucket();
  await client.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  await ensureBucket();
  const res = await client.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }));
  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}
