import crypto from "crypto";
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { env } from "../config/env";
import {
  disconnectSlack,
  exchangeCodeForToken,
  getSlackAuthUrl,
  getSlackStatus,
  upsertSlackConnection,
} from "../services/slack.service";

declare module "express-session" {
  interface SessionData {
    slackOAuthState?: string;
  }
}

const slackRouter = Router();

/**
 * GET /api/slack/connect
 * Initiates Slack OAuth flow by setting a CSRF state token in session and redirecting.
 */
slackRouter.get(
  "/connect",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!env.SLACK_CLIENT_ID || !env.SLACK_REDIRECT_URI) {
      return res.status(400).json({
        error: "Slack OAuth is not configured on the server.",
      });
    }

    const state = crypto.randomBytes(16).toString("hex");
    req.session.slackOAuthState = state;

    const url = getSlackAuthUrl(state);

    if (req.query.format === "json" || req.headers.accept?.includes("application/json")) {
      return res.json({ url });
    }

    return res.redirect(url);
  }),
);

/**
 * GET /api/slack/callback
 * Handles OAuth callback from Slack, validates state token, exchanges code for access token,
 * and persists the Slack connection.
 */
slackRouter.get(
  "/callback",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { code, state, error: slackError } = req.query;

    if (slackError) {
      console.warn("[slack] OAuth denied by user or Slack error:", slackError);
      return res.redirect(`${env.FRONTEND_URL}?slack_error=${encodeURIComponent(String(slackError))}`);
    }

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    const expectedState = req.session.slackOAuthState;
    delete req.session.slackOAuthState;

    if (!state || typeof state !== "string" || state !== expectedState) {
      return res.status(400).json({ error: "Invalid or expired OAuth state parameter" });
    }

    try {
      const tokenData = await exchangeCodeForToken(code);
      await upsertSlackConnection(
        req.user!.id,
        tokenData.accessToken,
        tokenData.teamId,
        tokenData.teamName,
        tokenData.channelId,
      );

      return res.redirect(`${env.FRONTEND_URL}?slack=connected`);
    } catch (err) {
      console.error("[slack] OAuth code exchange failed:", err);
      return res.redirect(
        `${env.FRONTEND_URL}?slack_error=${encodeURIComponent("Failed to complete Slack OAuth")}`,
      );
    }
  }),
);

/**
 * POST /api/slack/disconnect
 * Removes Slack connection for the authenticated user.
 */
slackRouter.post(
  "/disconnect",
  requireAuth,
  asyncHandler(async (req, res) => {
    const disconnected = await disconnectSlack(req.user!.id);
    return res.json({ success: true, disconnected });
  }),
);

/**
 * GET /api/slack/status
 * Returns connection status and workspace team details for the authenticated user.
 */
slackRouter.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = await getSlackStatus(req.user!.id);
    return res.json(status);
  }),
);

export default slackRouter;
