import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { prisma } from "./lib/prisma";
import { errorMiddleware } from "./lib/errors";
import { executorHealthy } from "./lib/executor";
import { globalLimiter } from "./middleware/rateLimit";
import { requestLog } from "./middleware/requestLog";
import { authRouter } from "./routes/auth.routes";
import { userRouter } from "./routes/user.routes";
import { questionRouter } from "./routes/question.routes";
import { testRouter } from "./routes/test.routes";
import { invitationRouter } from "./routes/invitation.routes";
import { candidateRouter } from "./routes/candidate.routes";
import { resultRouter } from "./routes/result.routes";
import { integrityRouter } from "./routes/integrity.routes";
import { orgRouter } from "./routes/org.routes";
import { supportRouter } from "./routes/support.routes";
import { notificationRouter } from "./routes/notification.routes";
import { billingRouter } from "./routes/billing.routes";
import { searchRouter } from "./routes/search.routes";

declare module "express-serve-static-core" {
  interface Request {
    id?: string;
  }
}

const allowedOrigins = new Set([config.webOrigin, ...config.allowedOrigins]);

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(
    helmet({
      // This is a JSON API with no server-rendered HTML/inline scripts, so a
      // strict CSP costs nothing and blocks it being framed/embedded as a
      // script source if a token or response is ever reflected somewhere it
      // shouldn't be.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
        },
      },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      hidePoweredBy: true,
    })
  );
  app.use((req, res, next) => {
    const incoming = req.headers["x-request-id"];
    req.id = typeof incoming === "string" && incoming ? incoming : crypto.randomUUID();
    res.setHeader("X-Request-Id", req.id);
    next();
  });
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header (server-to-server, curl, health checks) — allow.
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(globalLimiter);
  app.use(requestLog);

  app.get("/healthz", async (_req, res) => {
    const services: Record<string, boolean | string> = {};
    try {
      await prisma.$queryRaw`SELECT 1`;
      services.database = true;
    } catch {
      services.database = false;
    }
    const exec = await executorHealthy();
    services.executor = exec.executor;
    services.executorHealthy = exec.healthy;
    res.status(services.database ? 200 : 503).json({ ok: services.database, services });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", userRouter);
  app.use("/api/org", orgRouter);
  app.use("/api/questions", questionRouter);
  app.use("/api/tests", testRouter);
  app.use("/api/invitations", invitationRouter);
  app.use("/api/candidate", candidateRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/search", searchRouter);
  app.use("/api", integrityRouter); // /sessions/:id/integrity|replay, /tests/:id/plagiarism*, /plagiarism/:id
  app.use("/api", resultRouter); // /dashboard, /tests/:id/results, /sessions/:id, /submissions/:id/score

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorMiddleware);

  return app;
}
