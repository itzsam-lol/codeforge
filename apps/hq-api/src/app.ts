import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
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

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
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

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorMiddleware);

  return app;
}
