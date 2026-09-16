import { createApp } from "./app";
import { prisma } from "./config/database";
import { env } from "./config/env";
import { disconnectSessionStore } from "./config/session";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`[server] MailFlow API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[server] received ${signal}, shutting down...`);
  server.close(async () => {
    await disconnectSessionStore();
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
