import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { HttpError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

const createSenderSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
});

// GET /api/senders — list the current user's senders
router.get("/", async (req, res, next) => {
  try {
    const senders = await prisma.sender.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ senders });
  } catch (err) {
    next(err);
  }
});

// POST /api/senders — register a sending identity (unique per user + email)
router.post("/", async (req, res, next) => {
  try {
    const parsed = createSenderSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new HttpError(400, "Invalid sender payload"));
    }

    const { email, name } = parsed.data;
    const userId = req.user!.id;

    const existing = await prisma.sender.findUnique({
      where: { userId_email: { userId, email } },
    });
    if (existing) {
      return next(new HttpError(409, "A sender with this email already exists"));
    }

    const sender = await prisma.sender.create({
      data: { userId, email, name },
    });
    res.status(201).json({ sender });
  } catch (err) {
    next(err);
  }
});

export default router;
