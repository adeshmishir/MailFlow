import { prisma } from "../config/database";
import { env } from "../config/env";
import { createRedisConnection } from "../queues/email.queue";

export interface SlackStatusResult {
  connected: boolean;
  configured: boolean;
  teamName: string | null;
  teamId: string | null;
}

export interface SlackOAuthTokenResponse {
  ok: boolean;
  access_token?: string;
  scope?: string;
  team?: {
    id: string;
    name: string;
  };
  authed_user?: {
    id: string;
  };
  error?: string;
}

/**
 * Generate Slack OAuth authorization URL with CSRF state protection.
 */
export function getSlackAuthUrl(state: string): string {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_REDIRECT_URI) {
    throw new Error("Slack OAuth credentials (SLACK_CLIENT_ID / SLACK_REDIRECT_URI) are not configured.");
  }

  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: "chat:write,chat:write.public",
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Exchange OAuth authorization code for an access token.
 */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  teamId: string;
  teamName: string;
  channelId: string | null;
}> {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET || !env.SLACK_REDIRECT_URI) {
    throw new Error("Slack OAuth is not configured on the server.");
  }

  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: env.SLACK_REDIRECT_URI,
  });

  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Slack API HTTP error: ${response.statusText}`);
  }

  const data = (await response.json()) as SlackOAuthTokenResponse;
  if (!data.ok || !data.access_token || !data.team?.id) {
    throw new Error(`Slack OAuth error: ${data.error || "Failed to retrieve access token"}`);
  }

  return {
    accessToken: data.access_token,
    teamId: data.team.id,
    teamName: data.team.name || "Slack Workspace",
    channelId: data.authed_user?.id ?? null,
  };
}

/**
 * Persist or update Slack Connection for a user.
 */
export async function upsertSlackConnection(
  userId: string,
  accessToken: string,
  teamId: string,
  teamName: string,
  channelId: string | null = null,
) {
  return prisma.slackConnection.upsert({
    where: { userId },
    create: {
      userId,
      accessToken,
      teamId,
      teamName,
      channelId,
    },
    update: {
      accessToken,
      teamId,
      teamName,
      channelId,
    },
  });
}

/**
 * Disconnect Slack integration for a user.
 */
export async function disconnectSlack(userId: string): Promise<boolean> {
  const result = await prisma.slackConnection.deleteMany({
    where: { userId },
  });
  return result.count > 0;
}

/**
 * Return current Slack connection status for a user (never exposing access tokens).
 */
export async function getSlackStatus(userId: string): Promise<SlackStatusResult> {
  const isConfigured = Boolean(env.SLACK_CLIENT_ID) && Boolean(env.SLACK_CLIENT_SECRET);
  const conn = await prisma.slackConnection.findUnique({
    where: { userId },
    select: {
      teamId: true,
      teamName: true,
    },
  });

  if (!conn) {
    return {
      connected: false,
      configured: isConfigured,
      teamName: null,
      teamId: null,
    };
  }

  return {
    connected: true,
    configured: isConfigured,
    teamName: conn.teamName,
    teamId: conn.teamId,
  };
}

/**
 * Send a message to Slack workspace using the stored access token.
 * `channel` (a channel id or the connecting Slack user's id for a DM)
 * is used when available; otherwise the message is attempted without an
 * explicit channel. Failures are swallowed so email processing never breaks.
 */
export async function postSlackMessage(
  accessToken: string,
  text: string,
  channel?: string | null,
): Promise<boolean> {
  try {
    const payload: Record<string, string> = { text };
    if (channel) {
      payload.channel = channel;
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      console.error("[slack] Failed to post Slack message:", data.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[slack] Exception posting Slack message:", err);
    return false;
  }
}

/**
 * Trigger rate-limit Slack notification with Redis-backed distributed deduplication.
 * Only sends 1 notification per user/sender per hour window.
 * If Slack is disconnected or API fails, email processing is NEVER interrupted.
 */
export async function sendRateLimitSlackAlert(userId: string, senderEmail: string): Promise<void> {
  const redis = createRedisConnection();
  try {
    const hourWindow = Math.floor(Date.now() / 3_600_000);
    const alertKey = `slack-rate-alert:${userId}:${senderEmail}:${hourWindow}`;

    // Distributed lock/deduplication key with 1 hour TTL
    const acquired = await redis.set(alertKey, "1", "PX", 3_600_000, "NX");
    if (acquired !== "OK") {
      // Alert already sent for this sender during this window
      return;
    }

    const conn = await prisma.slackConnection.findUnique({
      where: { userId },
    });

    if (!conn) {
      console.log(`[slack] Rate limit reached for user ${userId}, but Slack is not connected.`);
      return;
    }

    const alertMessage = `⚠️ MailFlow rate limit reached for sender ${senderEmail}. Email processing has been delayed and will resume when allowed.`;
    const sent = await postSlackMessage(conn.accessToken, alertMessage, conn.channelId);

    if (sent) {
      console.log(`[slack] Rate limit alert notification sent to Slack workspace ${conn.teamName} for ${senderEmail}`);
    }
  } catch (err) {
    console.error(
      `[slack] Non-critical error triggering rate limit Slack alert for user ${userId}:`,
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    redis.disconnect();
  }
}
