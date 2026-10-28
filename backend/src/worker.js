import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { startScheduler } from "./workers/scheduler.js";

let scheduler;
let stopping = false;

async function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: stopping worker.`);
  await scheduler?.stop();
  await disconnectDatabase();
  process.exit(0);
}

try {
  await connectDatabase();
  scheduler = await startScheduler();
  console.log(`Background worker running (${scheduler.workerId}).`);
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
} catch (error) {
  console.error("Worker startup failed:", error.message);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
}
