import { Router } from "express";
import passport from "passport";
import { env } from "../config/env";
import { SESSION_COOKIE_NAME } from "../config/session";
import { isGoogleAuthConfigured } from "../config/passport";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET /api/auth/status — is Google auth wired up on the server?
router.get("/status", (_req, res) => {
  res.json({
    googleConfigured: isGoogleAuthConfigured,
  });
});

// GET /api/auth/google — start the Google OAuth flow
router.get("/google", (req, res, next) => {
  if (!isGoogleAuthConfigured) {
    return res.status(503).json({ error: "Google OAuth is not configured on the server" });
  }
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

// GET /api/auth/google/callback — Google redirects the browser here after auth
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${env.FRONTEND_URL}/login?error=google_auth_failed`,
    successRedirect: env.FRONTEND_URL,
  }),
);

// GET /api/auth/me — current session user
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout — destroy the session and clear the cookie
router.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.clearCookie(SESSION_COOKIE_NAME);
    res.json({ ok: true });
  });
});

export default router;
