import { createEmailWorker } from "./src/workers/email.worker";

const worker = createEmailWorker();

worker.on("ready", () => {
  console.log("[worker] email worker ready, listening for jobs");
});

function shutdown() {
  console.log("[worker] shutting down...");
  worker
    .close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);