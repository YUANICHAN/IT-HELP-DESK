import { env } from "../../config/env.js";
import { clockNow } from "../../shared/time/clock.js";
import { WorkerHeartbeat } from "./workerHeartbeat.model.js";

export async function startHeartbeat(workerId, at = clockNow()) {
  return WorkerHeartbeat.findOneAndUpdate(
    { workerId },
    {
      $setOnInsert: {
        workerId,
        startedAt: at,
        release: env.worker.applicationRelease,
      },
      $set: { lastSeenAt: at, status: "STARTING" },
    },
    { upsert: true, returnDocument: "after" },
  );
}

export async function updateHeartbeat(workerId, status, updates = {}) {
  const set = { lastSeenAt: clockNow(), status };
  const unset = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) unset[key] = 1;
    else set[key] = value;
  }
  return WorkerHeartbeat.updateOne(
    { workerId },
    {
      $set: set,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  );
}
