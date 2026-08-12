import crypto from "node:crypto";
import { config } from "../config";

const ALGO = "aes-256-gcm";

/**
 * At-rest encryption for provisioning SSH private keys. The key never
 * leaves this process decrypted except in-memory for the duration of a
 * provisioning run (see services/provisioning.ts) and is never included in
 * any API response after creation.
 */
export function encryptSecret(plaintext: string): string {
  const key = Buffer.from(config.sshKeyEncryptionSecret, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(ciphertext: string): string {
  const key = Buffer.from(config.sshKeyEncryptionSecret, "hex");
  const raw = Buffer.from(ciphertext, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/**
 * A stable short hash of the key material so staff can confirm two saved
 * entries reference the same key without ever displaying it again. Not a
 * true SSH fingerprint (that's derived from the public key); this is
 * simpler and sufficient for "is this the key I think it is" at a glance.
 */
export function fingerprintSecret(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex").slice(0, 16);
}
