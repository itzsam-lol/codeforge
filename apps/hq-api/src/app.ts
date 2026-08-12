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

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorMiddleware);

  return app;
}
