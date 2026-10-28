import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { Notification } from "../modules/notifications/notification.model.js";
import {
  authorizeNotificationRecord,
  notificationPresentation,
} from "../modules/notifications/notificationAuthorization.service.js";
import { OutboxEvent } from "../modules/outbox/outboxEvent.model.js";
import { runRequiredTransaction } from "../shared/database/transaction.js";
import { clockNow } from "../shared/time/clock.js";

export const MAX_DELIVERY_ATTEMPTS = 5;
export const RETRY_DELAYS_MS = Object.freeze([
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
]);

function leaseFilter(claim, at) {
  return {
    _id: claim._id,
    status: "PROCESSING",
    leaseToken: claim.leaseToken,
    leaseExpiresAt: { $gt: at },
  };
}

function clearLeaseUpdate() {
  return {
    leaseToken: "",
    leaseExpiresAt: "",
    claimedBy: "",
    claimedAt: "",
  };
}

function safeFailureCode(error) {
  if (error?.code === "TRANSACTIONS_UNAVAILABLE") {
    return "DELIVERY_TRANSACTIONS_UNAVAILABLE";
  }
  if (error?.name === "MongoServerSelectionError") {
    return "DATABASE_UNAVAILABLE";
  }
  return "DELIVERY_TEMPORARY_FAILURE";
}

export async function claimNextOutbox({
  workerId,
  at = clockNow(),
  leaseSeconds = env.worker.outboxLeaseSeconds,
} = {}) {
  await OutboxEvent.updateMany(
    {
      status: "PROCESSING",
      leaseExpiresAt: { $lte: at },
      attempts: { $gte: MAX_DELIVERY_ATTEMPTS },
    },
    {
      $set: {
        status: "FAILED",
        lastErrorCode: "DELIVERY_ATTEMPTS_EXHAUSTED",
      },
      $unset: clearLeaseUpdate(),
    },
  );

  const leaseToken = randomUUID();
  return OutboxEvent.findOneAndUpdate(
    {
      attempts: { $lt: MAX_DELIVERY_ATTEMPTS },
      $or: [
        { status: "PENDING", nextAttemptAt: { $lte: at } },
        { status: "PROCESSING", leaseExpiresAt: { $lte: at } },
      ],
    },
    {
      $set: {
        status: "PROCESSING",
        leaseToken,
        leaseExpiresAt: new Date(at.getTime() + leaseSeconds * 1000),
        claimedBy: workerId,
        claimedAt: at,
      },
      $inc: { attempts: 1 },
      $unset: { lastErrorCode: "" },
    },
    { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: "after" },
  ).select("+leaseToken");
}

export async function recordOutboxFailure(
  claim,
  errorCode,
  at = clockNow(),
) {
  const exhausted = claim.attempts >= MAX_DELIVERY_ATTEMPTS;
  const delay = RETRY_DELAYS_MS[Math.max(0, claim.attempts - 1)];
  const result = await OutboxEvent.updateOne(
    leaseFilter(claim, at),
    {
      $set: exhausted
        ? {
            status: "FAILED",
            lastErrorCode: "DELIVERY_ATTEMPTS_EXHAUSTED",
          }
        : {
            status: "PENDING",
            nextAttemptAt: new Date(at.getTime() + delay),
            lastErrorCode: errorCode,
          },
      $unset: clearLeaseUpdate(),
    },
  );
  return result.modifiedCount === 1;
}

export async function suppressClaim(
  claim,
  reasonCode,
  at = clockNow(),
) {
  const result = await OutboxEvent.updateOne(
    leaseFilter(claim, at),
    {
      $set: {
        status: "SUPPRESSED",
        suppressedAt: at,
        lastErrorCode: reasonCode,
      },
      $unset: clearLeaseUpdate(),
    },
  );
  return result.modifiedCount === 1;
}

export async function deliverInAppClaim(claim, at) {
  return runRequiredTransaction(async (session) => {
    const checkedAt = at || clockNow();
    const current = await OutboxEvent.findOne(leaseFilter(claim, checkedAt))
      .select("+leaseToken")
      .session(session);
    if (!current) return { outcome: "LEASE_LOST" };

    const authorization = await authorizeNotificationRecord(current, session);
    if (!authorization.allowed) {
      const decisionAt = at || clockNow();
      const suppressed = await OutboxEvent.updateOne(
        leaseFilter(claim, decisionAt),
        {
          $set: {
            status: "SUPPRESSED",
            suppressedAt: decisionAt,
            lastErrorCode: authorization.reason,
          },
          $unset: clearLeaseUpdate(),
        },
        { session },
      );
      if (suppressed.modifiedCount !== 1) {
        throw new Error("OUTBOX_LEASE_LOST");
      }
      return { outcome: "SUPPRESSED", reason: authorization.reason };
    }

    const presentation = notificationPresentation(current, authorization);
    const existing = await Notification.findOne({ outbox: current._id })
      .session(session)
      .lean();
    if (!existing) {
      await Notification.create([{
        organization: current.organization,
        recipient: current.recipient,
        outbox: current._id,
        eventType: current.eventType,
        aggregateType: current.aggregateType,
        aggregateId: current.aggregateId,
        accessKind: current.accessKind,
        visibility: current.visibility,
        title: presentation.title,
        linkPath: presentation.linkPath,
        metadata: current.metadata,
        deliveredAt: checkedAt,
      }], { session });
    }

    const completedAt = at || clockNow();
    const completed = await OutboxEvent.updateOne(
      leaseFilter(claim, completedAt),
      {
        $set: {
          status: "DELIVERED",
          deliveredAt: completedAt,
        },
        $unset: {
          ...clearLeaseUpdate(),
          lastErrorCode: "",
          suppressedAt: "",
        },
      },
      { session },
    );
    if (completed.modifiedCount !== 1) {
      throw new Error("OUTBOX_LEASE_LOST");
    }
    return { outcome: "DELIVERED" };
  }, {
    unavailableMessage:
      "In-app delivery requires MongoDB to run as a replica set.",
  });
}

export async function processOutboxClaim(claim, at) {
  const checkedAt = at || clockNow();
  if (claim.channel === "EMAIL") {
    await suppressClaim(claim, "EMAIL_DELIVERY_DISABLED", checkedAt);
    return { outcome: "SUPPRESSED" };
  }
  try {
    return await deliverInAppClaim(claim, at);
  } catch (error) {
    if (error?.message === "OUTBOX_LEASE_LOST") {
      return { outcome: "LEASE_LOST" };
    }
    await recordOutboxFailure(
      claim,
      safeFailureCode(error),
      at || clockNow(),
    );
    return { outcome: "RETRY_SCHEDULED", errorCode: safeFailureCode(error) };
  }
}

export async function processOutboxBatch({
  workerId,
  batchSize = env.worker.outboxBatchSize,
  concurrency = env.worker.outboxConcurrency,
  at,
} = {}) {
  const claims = [];
  for (let index = 0; index < batchSize; index += 1) {
    const claim = await claimNextOutbox({ workerId, at });
    if (!claim) break;
    claims.push(claim);
  }

  const summary = { claimed: claims.length, delivered: 0, suppressed: 0, retried: 0 };
  let cursor = 0;
  async function consume() {
    while (cursor < claims.length) {
      const claim = claims[cursor];
      cursor += 1;
      const result = await processOutboxClaim(claim, at);
      if (result.outcome === "DELIVERED") summary.delivered += 1;
      else if (result.outcome === "SUPPRESSED") summary.suppressed += 1;
      else if (result.outcome === "RETRY_SCHEDULED") summary.retried += 1;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, claims.length) }, consume),
  );
  return summary;
}
