import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  PORT: z.coerce.number().int().positive().default(5000),

  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(5010),

  DATABASE_URL: z.string().min(1),

  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  // Full connection string for managed / TLS Redis (e.g. Render Key Value,
  // Upstash, Redis Cloud). When set, REDIS_HOST/REDIS_PORT/REDIS_PASSWORD are
  // ignored. Supports redis:// and rediss:// (TLS) schemes.
  REDIS_URL: z.string().default(""),
  REDIS_PASSWORD: z.string().default(""),

  ELASTICSEARCH_URL: z.string().url().default("http://localhost:9200"),
  ELASTICSEARCH_INDEX: z.string().default("mailflow-emails"),
  // Optional API key for externally hosted Elasticsearch (Elastic Cloud, etc.)
  ELASTICSEARCH_API_KEY: z.string().default(""),

  FRONTEND_URL: z.string().url().default("http://localhost:5173"),

  SESSION_SECRET: z.string().default(""),
  SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(7 * 24 * 60 * 60 * 1000),
  SESSION_COOKIE_SECURE: z.string().trim().default(""),

  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CALLBACK_URL: z.string().default(""),

  SLACK_CLIENT_ID: z.string().default(""),
  SLACK_CLIENT_SECRET: z.string().default(""),
  SLACK_REDIRECT_URI: z.string().default(""),

  ETHEREAL_HOST: z.string().default(""),
  ETHEREAL_PORT: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().positive().default(587),
  ),
  ETHEREAL_USER: z.string().default(""),
  ETHEREAL_PASSWORD: z.string().default(""),

  // Generic / production SMTP provider (Gmail, Outlook, SendGrid, ...).
  // When SMTP_HOST + SMTP_USER + SMTP_PASSWORD are all set, they take
  // precedence over Ethereal. Ethereal remains the default test provider.
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().positive().default(587),
  ),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_SECURE: z.string().trim().default("false"),
  SMTP_ALLOW_ANY_FROM: z.string().trim().default("false"),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_EMAIL_DELAY_MS: z.coerce.number().int().nonnegative().default(2000),
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().positive().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n  ");

  console.error("[env] Invalid or missing environment variables:\n  " + issues);
  process.exit(1);
}

export const env = parsed.data;