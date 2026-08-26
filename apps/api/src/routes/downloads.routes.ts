/**
 * Public, unauthenticated downloads — currently just the CodeForge Sentinel
 * installer. No candidate token/session needed: the installer itself is
 * generic public software, not candidate-specific data (unlike everything
 * else this API serves under S3, which is always presigned/private — see
 * lib/s3.ts's header comment).
 *
 * The installer is uploaded manually to the existing S3/MinIO bucket at a
 * fixed key (SENTINEL_INSTALLER_KEY below) — re-uploading a new build under
 * the same key makes it "latest" with no code change here.
 */
import { Router } from "express";
import { asyncHandler, notFound } from "../lib/errors";
import { getObjectBuffer } from "../lib/s3";
import { logger } from "../lib/logger";

const SENTINEL_INSTALLER_KEY = "sentinel/CodeForge-Sentinel-Setup.exe";

export const downloadsRouter = Router();

downloadsRouter.get(
  "/sentinel-setup",
  asyncHandler(async (_req, res) => {
    let body: Buffer;
    try {
      body = await getObjectBuffer(SENTINEL_INSTALLER_KEY);
    } catch (err) {
      logger.warn({ err }, "downloads: sentinel installer not found in object storage");
      throw notFound("The Sentinel installer isn't available right now. Please contact support.");
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="CodeForge-Sentinel-Setup.exe"');
    res.setHeader("Cache-Control", "no-store");
    res.send(body);
  })
);
