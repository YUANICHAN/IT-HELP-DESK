import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { env } from "../config/env.js";
import { clockNow } from "../shared/time/clock.js";
import {
  startHeartbeat,
  updateHeartbeat,
} from "../modules/health/workerHeartbeat.service.js";
import { runCleanupJob } from "../modules/maintenance/maintenance.service.js";
import { processOutboxBatch } from "./outbox.processor.js";
import { evaluateSlaBreaches } from "./sla.processor.js";

function workerIdentity() {
  return `${hostname()}:${process.pid}:${randomUUID()}`;
}

export async function startScheduler({ workerId = workerIdentity() } = {}) {
  let stopping = false;
  const active = new Set();
  const timers = [];

  await startHeartbeat(workerId);
  await updateHeartbeat(workerId, "RUNNING");

  function tracked(name, work, { successUpdate, errorUpdate = {} } = {}) {
    if (stopping || active.has(name)) return Promise.resolve();
    active.add(name);
    return Promise.resolve()
      .then(work)
      .then(async (result) => {
        if (successUpdate) {
          await updateHeartbeat(workerId, "RUNNING", successUpdate()).catch(() => undefined);
        }
        return result;
      })
      .catch(async (error) => {
        console.error(`${name} failed:`, error.message);
        await updateHeartbeat(workerId, "RUNNING", {
          ...errorUpdate,
          ...(errorUpdate.lastDeliveryErrorCode ? { lastDeliveryStatus: "FAILED", lastDeliveryRunAt: clockNow() } : {}),
          ...(errorUpdate.lastSlaErrorCode ? { lastSlaStatus: "FAILED", lastSlaRunAt: clockNow() } : {}),
          ...(errorUpdate.lastCleanupErrorCode ? { lastCleanupStatus: "FAILED", lastCleanupRunAt: clockNow() } : {}),
        }).catch(() => undefined);
      })
      .finally(() => active.delete(name));
  }

  const runDelivery = () => tracked(
    "Outbox delivery",
    async () => {
      const summary = await processOutboxBatch({ workerId });
      if (summary.claimed > 0) console.log("Outbox delivery:", summary);
    },
    {
      successUpdate: () => ({
        lastDeliveryRunAt: clockNow(), lastDeliveryStatus: "SUCCESS", lastDeliveryErrorCode: undefined,
      }),
      errorUpdate: { lastDeliveryErrorCode: "OUTBOX_DELIVERY_FAILURE" },
    },
  );
  const runSla = () => tracked("SLA evaluation", async () => {
    const summary = await evaluateSlaBreaches({
      limit: env.sla.evaluationBatchSize,
    });
    if (summary.breaches || summary.reconciliationRequired) {
      console.log("SLA evaluation:", summary);
    }
  }, {
    successUpdate: () => ({ lastSlaRunAt: clockNow(), lastSlaStatus: "SUCCESS", lastSlaErrorCode: undefined }),
    errorUpdate: { lastSlaErrorCode: "SLA_EVALUATION_FAILURE" },
  });
  const runCleanup = () => tracked(
    "Background cleanup",
    async () => {
      const result = await runCleanupJob({ workerId });
      if (result.completed) console.log("Background cleanup:", result.summary);
    },
    {
      successUpdate: () => ({
        lastCleanupRunAt: clockNow(), lastCleanupStatus: "SUCCESS", lastCleanupErrorCode: undefined,
      }),
      errorUpdate: { lastCleanupErrorCode: "BACKGROUND_CLEANUP_FAILURE" },
    },
  );
  const runHeartbeat = () => tracked(
    "Worker heartbeat",
    () => updateHeartbeat(workerId, "RUNNING"),
  );

  void runDelivery();
  void runSla();
  void runCleanup();
  timers.push(setInterval(runDelivery, env.worker.outboxPollIntervalMs));
  timers.push(setInterval(runSla, env.sla.evaluationIntervalSeconds * 1000));
  timers.push(setInterval(runCleanup, env.worker.cleanupIntervalSeconds * 1000));
  timers.push(setInterval(
    runHeartbeat,
    env.worker.heartbeatIntervalSeconds * 1000,
  ));
  for (const timer of timers) timer.unref();

  return {
    workerId,
    runDelivery,
    runSla,
    runCleanup,
    async stop() {
      if (stopping) return;
      stopping = true;
      for (const timer of timers) clearInterval(timer);
      await updateHeartbeat(workerId, "STOPPING").catch(() => undefined);
      while (active.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await updateHeartbeat(workerId, "STOPPED").catch(() => undefined);
    },
  };
}
