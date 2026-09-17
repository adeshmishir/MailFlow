import session from "express-session";
import RedisStore from "connect-redis";
import { createClient } from "redis";
import { env } from "./env";
import { getRedisUrl } from "./redis";

export const SESSION_COOKIE_NAME = "mailflow.sid";
export const SESSION_STORE_PREFIX = "mailflow:sess:";

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const sessionRedisClient = createClient({
  url: getRedisUrl(),
});

sessionRedisClient.on("error", (err) => {
  console.error("[session] redis error:", err.message);
});

void sessionRedisClient.connect();

export const sessionStore = new RedisStore({
  client: sessionRedisClient,
  prefix: SESSION_STORE_PREFIX,
});

function resolveCookieSecure(): boolean {
  return env.NODE_ENV === "production";
}

export function createSessionMiddleware() {
  const secret = env.SESSION_SECRET || "mailflow-dev-insecure-session-secret";

  return session({
    name: SESSION_COOKIE_NAME,
    secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: resolveCookieSecure(),
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_MS,
    },
  });
}

export async function disconnectSessionStore(): Promise<void> {
  if (sessionRedisClient.isOpen) {
    await sessionRedisClient.quit();
  }
}
