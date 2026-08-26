import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as Sentry from "@sentry/node";
import { config } from "./config";
import { prisma } from "./lib/prisma";
import { errorMiddleware } from "./lib/errors";
import { globalLimiter } from "./middleware/rateLimit";
import { requestLog } from "./middleware/requestLog";
import { authRouter } from "./routes/auth.routes";
import { staffRouter } from "./routes/staff.routes";
import { clientRouter } from "./routes/client.routes";
import { leadRouter } from "./routes/lead.routes";
import { provisioningRouter } from "./routes/provisioning.routes";
import { invoiceRouter } from "./routes/invoice.routes";
import { supportRouter } from "./routes/support.routes";
import { notificationRouter } from "./routes/notification.routes";
import { statusRouter } from "./routes/status.routes";
import { billingRouter } from "./routes/billing.routes";
import { auditRouter } from "./routes/audit.routes";
import { dashboardRouter } from "./routes/dashboard.routes";
import { searchRouter } from "./routes/search.routes";
import { contestRouter } from "./routes/contest.routes";
import { questionBankRouter } from "./routes/questionBank.routes";

declare module "express-serve-static-core" {
  interface Request {
    id?: string;
  }
}

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(
    helmet({
      // Mirrors apps/api/src/app.ts's config: this is a JSON API with no
      // server-rendered HTML/inline scripts, and handles more sensitive
      // data than the client-facing API (SSH-key-based provisioning,
      // client billing) — no reason for its security-header posture to be
      // any less deliberate than the app it manages.
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
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(globalLimiter);
  app.use(requestLog);

  app.get("/healthz", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/clients", clientRouter);
  app.use("/api/leads", leadRouter);
  app.use("/api", provisioningRouter); // /clients/:clientId/provisioning/*
  app.use("/api", invoiceRouter); // /clients/:clientId/invoices, /invoices/:id
  app.use("/api/support-tickets", supportRouter);
  app.use("/api/notifications", notificationRouter);
  // Public, unauthenticated (see status.routes.ts) — deliberately not behind
  // the cors() origin restriction above in spirit, though in practice this
  // gets fetched server-side by apps/hq's status page, never from a browser.
  app.use("/api/status", statusRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/audit-log", auditRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/contests", contestRouter);
  app.use("/api/questions/bank", questionBankRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  // No-op when SENTRY_DSN is unset. Mirrors apps/api/src/app.ts.
  Sentry.setupExpressErrorHandler(app);
  app.use(errorMiddleware);

  return app;
}
