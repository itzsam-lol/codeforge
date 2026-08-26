import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { config } from "../config";
import { getObjectBuffer } from "../lib/s3";

/**
 * Cloud Vision analysis of one proctoring snapshot (periodic webcam
 * captures, not continuous video — see plan's architecture note on why
 * Vision rather than Video Intelligence). Calls the plain REST API with an
 * API key (GOOGLE_AI_API_KEY, shared with services/aiHint.ts's Gemini
 * calls) rather than the @google-cloud/vision client library, which
 * expects a service-account key/ADC — many GCP orgs (particularly
 * credit-program-provisioned projects) enforce the
 * iam.disableServiceAccountKeyCreation org policy, which blocks minting
 * service-account keys but has no effect on API keys or the REST surface.
 *
 * No-ops entirely, not an error, when no key is configured — this is
 * optional infrastructure layered on top of Proctor-to-Earn, never a hard
 * dependency for a contest to run.
 */

const PHONE_LABELS = ["mobile phone", "cell phone", "smartphone", "telephone", "tablet computer"];

interface Flag {
  severity: 1 | 2 | 3;
  reason: string;
  confidence: number;
  snapshotKey: string;
  createdAt: string;
}

interface VisionFaceAnnotation {
  detectionConfidence?: number;
}
interface VisionObjectAnnotation {
  name?: string;
  score?: number;
}
interface VisionAnnotateResponse {
  responses?: {
    faceAnnotations?: VisionFaceAnnotation[];
    localizedObjectAnnotations?: VisionObjectAnnotation[];
    error?: { message?: string };
  }[];
}

export async function analyzeArenaSnapshot(participationId: string, key: string): Promise<void> {
  if (!config.googleAiApiKey) return;

  try {
    const buffer = await getObjectBuffer(key);
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${config.googleAiApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: buffer.toString("base64") },
            features: [{ type: "FACE_DETECTION" }, { type: "OBJECT_LOCALIZATION" }],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Vision API responded ${res.status}`);
    const body = (await res.json()) as VisionAnnotateResponse;
    const result = body.responses?.[0];
    if (!result || result.error) throw new Error(result?.error?.message ?? "Vision API returned no result");

    const flags: Flag[] = [];
    const faces = result.faceAnnotations ?? [];
    if (faces.length === 0) {
      flags.push({ severity: 1, reason: "No face detected in frame", confidence: 1, snapshotKey: key, createdAt: new Date().toISOString() });
    } else if (faces.length > 1) {
      flags.push({
        severity: 3,
        reason: `${faces.length} faces detected in frame`,
        confidence: Math.max(...faces.map((f) => f.detectionConfidence ?? 0)),
        snapshotKey: key,
        createdAt: new Date().toISOString(),
      });
    }

    const objects = result.localizedObjectAnnotations ?? [];
    for (const obj of objects) {
      const name = (obj.name ?? "").toLowerCase();
      if (PHONE_LABELS.some((l) => name.includes(l))) {
        flags.push({
          severity: 3,
          reason: `Possible ${obj.name} detected in frame`,
          confidence: obj.score ?? 0,
          snapshotKey: key,
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (flags.length === 0) return;

    const participation = await prisma.arenaParticipation.findUnique({ where: { id: participationId } });
    if (!participation) return;
    const existing = (participation.aiFlags as unknown as Flag[]) ?? [];
    await prisma.arenaParticipation.update({
      where: { id: participationId },
      data: { aiFlags: [...existing, ...flags] as unknown as object },
    });
    logger.info({ participationId, flags: flags.length }, "arena snapshot analysis: flags recorded");
  } catch (err) {
    // A failed analysis is never fatal to the contest — the snapshot is
    // already stored either way, this is best-effort enrichment.
    logger.error({ err, participationId, key }, "[arena] snapshot analysis failed");
  }
}
