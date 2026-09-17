import cors from "cors";
import express from "express";
import passport from "passport";
import { env } from "./config/env";
import { configurePassport } from "./config/passport";
import { createSessionMiddleware } from "./config/session";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import adminRouter from "./routes/admin.routes";
import authRouter from "./routes/auth.routes";
import emailRouter from "./routes/email.routes";
import healthRouter from "./routes/health.routes";
import senderRouter from "./routes/sender.routes";
import slackRouter from "./routes/slack.routes";

export function createApp() {
  const app = express();

  // Trust the TLS-terminating proxies in front of us (Render LB, the nginx
  // frontend) so req.ip / req.protocol reflect the real client.
  app.set("trust proxy", 1);

  configurePassport();

  // FRONTEND_URL may be a comma-separated list (multiple environments).
  const allowedOrigins = env.FRONTEND_URL.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(createSessionMiddleware());
  app.use(passport.initialize());
  app.use(passport.session());

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/senders", senderRouter);
  app.use("/api/emails", emailRouter);
  app.use("/api/slack", slackRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
