import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { prisma } from "./lib/prisma";
import { errorMiddleware } from "./lib/errors";
import { executorHealthy } from "./lib/executor";
import { globalLimiter } from "./middleware/rateLimit";
import { authRouter } from "./routes/auth.routes";
import { userRouter } from "./routes/user.routes";
import { questionRouter } from "./routes/question.routes";
import { testRouter } from "./routes/test.routes";
import { invitationRouter } from "./routes/invitation.routes";
import { candidateRouter } from "./routes/candidate.routes";
import { resultRouter } from "./routes/result.routes";
import { integrityRouter } from "./routes/integrity.routes";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(globalLimiter);

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
  app.use("/api/questions", questionRouter);
  app.use("/api/tests", testRouter);
  app.use("/api/invitations", invitationRouter);
  app.use("/api/candidate", candidateRouter);
  app.use("/api", integrityRouter); // /sessions/:id/integrity|replay, /tests/:id/plagiarism*, /plagiarism/:id
  app.use("/api", resultRouter); // /dashboard, /tests/:id/results, /sessions/:id, /submissions/:id/score

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorMiddleware);

  return app;
}
