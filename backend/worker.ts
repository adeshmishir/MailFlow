import http from "http";
import { createEmailWorker } from "./src/workers/email.worker";
import { env } from "./src/config/env";
import { EMAIL_QUEUE_NAME, emailQueue } from "./src/queues/email.queue";

const worker = createEmailWorker();

worker.on("ready", () => {
  console.log("[worker] email worker ready, listening for jobs");
});

const healthServer = http.createServer(async (_req, res) => {
  try {
    const counts = await emailQueue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "mailflow-worker",
        queue: EMAIL_QUEUE_NAME,
        counts,
      }),
    );
  } catch (err) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  }
});

healthServer.listen(env.WORKER_HEALTH_PORT, () => {
  console.log(`[worker] health server listening on :${env.WORKER_HEALTH_PORT}`);
});

function shutdown() {
  console.log("[worker] shutting down...");
  healthServer.close();
  worker
    .close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);