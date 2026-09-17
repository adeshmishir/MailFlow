import { Router } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { EMAIL_QUEUE_NAME, emailQueue } from "../queues/email.queue";

/**
 * BullMQ dashboard served under an authenticated route.
 *
 * The dashboard is only mounted BEHIND requireAuth so queue states (delayed,
 * waiting, active, completed, failed) are never exposed publicly. It is based
 * on Bull Board and reuses the existing "email-send" queue, so no secrets or
 * queue internals leak through the public API.
 */
const BASE_PATH = "/api/admin/queues";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(BASE_PATH);

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
  options: {
    uiConfig: {
      boardTitle: "MailFlow — BullMQ Dashboard",
    },
  },
});

const adminRouter = Router();

adminRouter.use(requireAuth);

adminRouter.get("/", (_req, res) => {
  const counts = ["waiting", "active", "completed", "failed", "delayed"] as const;
  res.json({ queues: [{ name: EMAIL_QUEUE_NAME, counts }] });
});

adminRouter.use("/queues", serverAdapter.getRouter());

/**
 * Queue health summary used by operational tooling. Auth required.
 */
adminRouter.get(
  "/email-queue/stats",
  asyncHandler(async (_req, res) => {
    const counts = await emailQueue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
    );
    res.json({ name: EMAIL_QUEUE_NAME, counts });
  }),
);

export default adminRouter;