import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { Session } from "../auth/session.model.js";
import { cleanupAttachments } from "../attachments/attachment.service.js";
import { IdempotencyKey } from "../../shared/database/idempotencyKey.model.js";
import { clockNow } from "../../shared/time/clock.js";
import { MaintenanceJob } from "./maintenanceJob.model.js";

const JOB_NAME = "background_cleanup";

async function deleteBounded(Model, filter, limit) {
  const ids = await Model.find(filter).select("_id").limit(limit).lean();
  if (ids.length === 0) return 0;
  const result = await Model.deleteMany({ _id: { $in: ids.map((row) => row._id) } });
  return result.deletedCount;
}

export async function claimCleanupJob({
  workerId,
  at = clockNow(),
  leaseSeconds = env.worker.outboxLeaseSeconds,
} = {}) {
  await MaintenanceJob.updateOne(
    { name: JOB_NAME },
    {
      $setOnInsert: {
        name: JOB_NAME,
        status: "IDLE",
        nextRunAt: at,
      },
    },
    { upsert: true },
  );
  const leaseToken = randomUUID();
  return MaintenanceJob.findOneAndUpdate(
    {
      name: JOB_NAME,
      $or: [
        { status: "IDLE", nextRunAt: { $lte: at } },
        { status: "PROCESSING", leaseExpiresAt: { $lte: at } },
      ],
    },
    {
      $set: {
        status: "PROCESSING",
        leaseToken,
        leaseExpiresAt: new Date(at.getTime() + leaseSeconds * 1000),
        claimedBy: workerId,
        lastStartedAt: at,
      },
      $unset: { lastErrorCode: "" },
    },
    { returnDocument: "after" },
  ).select("+leaseToken");
}

export async function performCleanup({
  at = clockNow(),
  limit = env.worker.cleanupBatchSize,
} = {}) {
  const [sessions, idempotency] = await Promise.all([
    deleteBounded(Session, {
      $or: [
        { idleExpiresAt: { $lte: at } },
        { absoluteExpiresAt: { $lte: at } },
      ],
    }, limit),
    deleteBounded(IdempotencyKey, { expiresAt: { $lte: at } }, limit),
  ]);
  const attachments = await cleanupAttachments({
    olderThan: new Date(
      at.getTime() - env.worker.abandonedUploadMinutes * 60_000,
    ),
    limit,
  });
  return {
    expiredSessions: sessions,
    expiredIdempotencyRecords: idempotency,
    abandonedUploadReservations: attachments.reservations,
    orphanUploadFiles: attachments.orphanFiles,
    activationTokens: "NOT_IMPLEMENTED",
    passwordResetTokens: "NOT_IMPLEMENTED",
    exports: "NOT_IMPLEMENTED",
  };
}

export async function runCleanupJob({ workerId, at = clockNow() } = {}) {
  const claim = await claimCleanupJob({ workerId, at });
  if (!claim) return { claimed: false };
  try {
    const summary = await performCleanup({ at });
    const completedAt = clockNow();
    const result = await MaintenanceJob.updateOne(
      {
        _id: claim._id,
        status: "PROCESSING",
        leaseToken: claim.leaseToken,
        leaseExpiresAt: { $gt: completedAt },
      },
      {
        $set: {
          status: "IDLE",
          nextRunAt: new Date(
            completedAt.getTime() + env.worker.cleanupIntervalSeconds * 1000,
          ),
          lastCompletedAt: completedAt,
          lastStatus: "SUCCESS",
          lastSummary: summary,
        },
        $unset: {
          leaseToken: "",
          leaseExpiresAt: "",
          claimedBy: "",
          lastErrorCode: "",
        },
      },
    );
    return { claimed: true, completed: result.modifiedCount === 1, summary };
  } catch (error) {
    const failedAt = clockNow();
    await MaintenanceJob.updateOne(
      {
        _id: claim._id,
        leaseToken: claim.leaseToken,
        leaseExpiresAt: { $gt: failedAt },
      },
      {
        $set: {
          status: "IDLE",
          nextRunAt: new Date(
            failedAt.getTime() + env.worker.cleanupIntervalSeconds * 1000,
          ),
          lastCompletedAt: failedAt,
          lastStatus: "FAILED",
          lastErrorCode: "CLEANUP_TEMPORARY_FAILURE",
        },
        $unset: { leaseToken: "", leaseExpiresAt: "", claimedBy: "" },
      },
    );
    throw error;
  }
}
