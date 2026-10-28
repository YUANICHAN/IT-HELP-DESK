import mongoose from "mongoose";
import { env } from "../../config/env.js";
import { clockNow } from "../../shared/time/clock.js";
import { MaintenanceJob } from "../maintenance/maintenanceJob.model.js";
import { OutboxEvent } from "../outbox/outboxEvent.model.js";
import { inspectBackupEvidence, inspectPrivateStorage } from "./operationsEvidence.service.js";
import { WorkerHeartbeat } from "./workerHeartbeat.model.js";

function iso(value) {
  return value?.toISOString?.() || null;
}

function taskComponent(heartbeat, prefix, maximumAgeSeconds, at) {
  const runAt = heartbeat?.[`last${prefix}RunAt`];
  const runStatus = heartbeat?.[`last${prefix}Status`];
  const errorCode = heartbeat?.[`last${prefix}ErrorCode`];
  if (!runAt || !runStatus) {
    return {
      status: "unknown",
      lastRunAt: null,
      lastOutcome: null,
      maximumAgeSeconds,
      diagnosticCode: `${prefix.toUpperCase()}_STATUS_NOT_RECORDED`,
    };
  }
  const ageSeconds = Math.max(0, Math.floor((at - runAt) / 1000));
  const stale = ageSeconds > maximumAgeSeconds;
  return {
    status: runStatus === "FAILED" || stale ? "degraded" : "healthy",
    lastRunAt: iso(runAt),
    lastOutcome: runStatus,
    ageSeconds,
    maximumAgeSeconds,
    diagnosticCode: errorCode || (stale ? `${prefix.toUpperCase()}_STATUS_STALE` : null),
  };
}

async function databaseComponent() {
  if (mongoose.connection.readyState !== 1) {
    return { status: "unavailable", connected: false, diagnosticCode: "DATABASE_NOT_CONNECTED" };
  }
  try {
    await mongoose.connection.db.admin().command({ ping: 1 }, { maxTimeMS: 2_000 });
    return { status: "healthy", connected: true, diagnosticCode: null };
  } catch {
    return { status: "unavailable", connected: false, diagnosticCode: "DATABASE_PING_FAILED" };
  }
}

export async function administratorHealth(organizationId, { at = clockNow() } = {}) {
  const staleBefore = new Date(at.getTime() - env.worker.staleHeartbeatSeconds * 1000);
  const orgId = new mongoose.Types.ObjectId(organizationId);
  const [database, storage, backup, runningHeartbeat, latestHeartbeat, pending, failed,
    expiredLeases, oldestPending, failures, cleanup] = await Promise.all([
    databaseComponent(),
    inspectPrivateStorage(),
    inspectBackupEvidence({ at }),
    WorkerHeartbeat.findOne({ status: "RUNNING" }).sort({ lastSeenAt: -1 }).lean().catch(() => null),
    WorkerHeartbeat.findOne().sort({ lastSeenAt: -1 }).lean().catch(() => null),
    OutboxEvent.countDocuments({ organization: orgId, status: "PENDING" }).catch(() => null),
    OutboxEvent.countDocuments({ organization: orgId, status: "FAILED" }).catch(() => null),
    OutboxEvent.countDocuments({
      organization: orgId,
      status: "PROCESSING",
      leaseExpiresAt: { $lte: at },
    }).catch(() => null),
    OutboxEvent.findOne({ organization: orgId, status: "PENDING" })
      .sort({ createdAt: 1 }).select("createdAt").lean().catch(() => null),
    OutboxEvent.aggregate([
      { $match: { organization: orgId, status: "FAILED" } },
      { $group: { _id: "$lastErrorCode", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).catch(() => []),
    MaintenanceJob.findOne({ name: "background_cleanup" }).lean().catch(() => null),
  ]);
  const heartbeat = runningHeartbeat || latestHeartbeat;
  const heartbeatFresh = Boolean(
    heartbeat && heartbeat.status === "RUNNING" && heartbeat.lastSeenAt > staleBefore,
  );
  const worker = heartbeat
    ? {
        status: heartbeatFresh ? "healthy" : "degraded",
        processStatus: heartbeat.status,
        release: heartbeat.release,
        startedAt: iso(heartbeat.startedAt),
        lastSeenAt: iso(heartbeat.lastSeenAt),
        fresh: heartbeatFresh,
        staleAfterSeconds: env.worker.staleHeartbeatSeconds,
        diagnosticCode: heartbeatFresh ? null : "WORKER_HEARTBEAT_STALE",
      }
    : {
        status: "unknown",
        processStatus: "MISSING",
        fresh: false,
        staleAfterSeconds: env.worker.staleHeartbeatSeconds,
        diagnosticCode: "WORKER_HEARTBEAT_MISSING",
      };
  const outboxUnavailable = [pending, failed, expiredLeases].some((value) => value === null);
  const outbox = {
    status: outboxUnavailable
      ? "unavailable"
      : failed > 0 || expiredLeases > 0
        ? "degraded"
        : "healthy",
    pending,
    failed,
    expiredProcessingLeases: expiredLeases,
    oldestPendingAgeSeconds: oldestPending
      ? Math.max(0, Math.floor((at - oldestPending.createdAt) / 1000))
      : null,
    failureSummary: failures.map((row) => ({
      code: row._id || "UNSPECIFIED_FAILURE",
      count: row.count,
    })),
  };
  const slaScheduler = taskComponent(
    heartbeat,
    "Sla",
    env.sla.evaluationIntervalSeconds * 2 + env.worker.staleHeartbeatSeconds,
    at,
  );
  const delivery = taskComponent(
    heartbeat,
    "Delivery",
    Math.ceil((env.worker.outboxPollIntervalMs * 3) / 1000) + env.worker.staleHeartbeatSeconds,
    at,
  );
  const cleanupTask = taskComponent(
    heartbeat,
    "Cleanup",
    env.worker.cleanupIntervalSeconds * 2 + env.worker.staleHeartbeatSeconds,
    at,
  );
  const cleanupStatus = cleanup?.lastStatus === "FAILED" ? "degraded" : cleanupTask.status;
  const cleanupResult = {
    ...cleanupTask,
    status: cleanupStatus,
    lastCompletedAt: iso(cleanup?.lastCompletedAt),
    lastOutcome: cleanup?.lastStatus || cleanupTask.lastOutcome,
    diagnosticCode: cleanup?.lastErrorCode || cleanupTask.diagnosticCode,
  };
  const components = { database, worker, delivery, outbox, slaScheduler, cleanup: cleanupResult, storage, backup };
  const values = Object.values(components).map((component) => component.status);
  const overall = database.status === "unavailable"
    ? "unavailable"
    : values.every((status) => status === "healthy")
      ? "ok"
      : "degraded";
  return {
    status: overall,
    checkedAt: at.toISOString(),
    components,
    database,
    worker,
    delivery,
    outbox,
    slaScheduler,
    cleanup: cleanupResult,
    storage,
    backup,
  };
}
