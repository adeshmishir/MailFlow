import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { EMAIL_QUEUE_NAME } from "../queues/email.queue";
import {
  listScheduledEmails,
  listSentEmails,
  scheduleEmailsSchema,
  scheduleEmails,
} from "../services/emailScheduling.service";
import { asyncHandler } from "../middleware/asyncHandler";

const emailRouter = Router();

/**
 * POST /api/emails/schedule
 * Body: { senderId, subject, body, recipients: string[], scheduledAt }
 * Auth required. Never sends — only creates Campaign + Email rows and
 * enqueues one BullMQ Delayed job per email.
 */
emailRouter.post(
  "/schedule",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = scheduleEmailsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid payload",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await scheduleEmails(req.user!.id, parsed.data);
    return res.status(201).json(result);
  }),
);

/**
 * GET /api/emails/scheduled?cursor=&limit=
 * Auth required. Emails still waiting (status not SENT), newest first.
 */
emailRouter.get(
  "/scheduled",
  requireAuth,
  asyncHandler(async (req, res) => {
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const result = await listScheduledEmails(req.user!.id, cursor, limit);
    return res.json(result);
  }),
);

/**
 * GET /api/emails/sent?cursor=&limit=
 * Auth required. Already-sent emails, most recent first.
 */
emailRouter.get(
  "/sent",
  requireAuth,
  asyncHandler(async (req, res) => {
    const cursor =
      typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const result = await listSentEmails(req.user!.id, cursor, limit);
    return res.json(result);
  }),
);

export default emailRouter;
