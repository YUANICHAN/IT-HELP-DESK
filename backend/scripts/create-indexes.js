import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import "../src/app.js";
import mongoose from "mongoose";
import { Ticket } from "../src/modules/tickets/ticket.model.js";
import { TicketEvent } from "../src/modules/tickets/ticketEvent.model.js";
import { SlaCycle } from "../src/modules/service-levels/slaCycle.model.js";
import { SlaPolicy } from "../src/modules/service-levels/slaPolicy.model.js";
import { BusinessCalendar } from "../src/modules/service-levels/businessCalendar.model.js";
import "../src/modules/service-levels/slaBreach.model.js";
import { env } from "../src/config/env.js";
import { enqueueOutboxEvent } from "../src/modules/outbox/outbox.service.js";
import { OutboxEvent } from "../src/modules/outbox/outboxEvent.model.js";
import "../src/modules/notifications/notification.model.js";
import "../src/modules/health/workerHeartbeat.model.js";
import "../src/modules/maintenance/maintenanceJob.model.js";
import { IdempotencyKey } from "../src/shared/database/idempotencyKey.model.js";

async function migrateLegacyOutbox() {
  const legacyRows = OutboxEvent.collection.find({
    deduplicationKey: { $exists: false },
  });
  for await (const row of legacyRows) {
    if (["PENDING", "PROCESSING", "FAILED"].includes(row.status)) {
      const ticket = row.aggregateType === "TICKET";
      const approval = ticket && row.eventType.includes("APPROVAL");
      const defaultAccessKind = ticket
        ? approval ? "TICKET_APPROVER" : row.visibility === "INTERNAL"
          ? "TICKET_INTERNAL" : "TICKET_PUBLIC"
        : "ASSET_MANAGER";
      await enqueueOutboxEvent({
        organization: row.organization,
        sourceEvent: row._id,
        eventType: row.eventType,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        directRecipients: (row.recipients?.userIds || []).map((userId) => ({
          userId,
          accessKind: defaultAccessKind,
          visibility: row.visibility || "PUBLIC",
          channel: "IN_APP",
        })),
        capabilityRecipients: row.recipients?.capability
          ? [{
              capability: row.recipients.capability,
              department: row.recipients.department,
              accessKind: row.visibility === "INTERNAL"
                ? "TICKET_INTERNAL"
                : row.aggregateType === "ASSET"
                  ? "ASSET_MANAGER"
                  : "TICKET_PUBLIC",
              visibility: row.visibility || "PUBLIC",
              channel: "IN_APP",
            }]
          : [],
        metadata: row.payload || {},
        occurredAt: row.availableAt || row.createdAt || new Date(),
      });
    }
    await OutboxEvent.collection.updateOne(
      { _id: row._id, deduplicationKey: { $exists: false } },
      {
        $set: {
          status: "SUPPRESSED",
          suppressedAt: new Date(),
          lastErrorCode: "LEGACY_SELECTOR_MIGRATED",
        },
      },
    );
  }
}
export async function createIndexes() {
  const idempotencyExpiry = new Date(
    Date.now() + env.worker.idempotencyRetentionHours * 3_600_000,
  );
  await IdempotencyKey.collection.updateMany(
    { expiresAt: { $exists: false } },
    { $set: { expiresAt: idempotencyExpiry } },
  );
  const idempotencyIndexes = await IdempotencyKey.collection.indexes()
    .catch(() => []);
  if (idempotencyIndexes.some((index) => index.name === "idempotency_key_retention_ttl")) {
    await IdempotencyKey.collection.dropIndex("idempotency_key_retention_ttl");
  }
  await migrateLegacyOutbox();
  // Only legacy non-approval tickets can be backfilled automatically.
  await Ticket.collection.updateMany({ approvalRequired: false, currentApprovalRound: { $exists: false } }, { $set: { currentApprovalRound: 0 } });
  // Repeatable backfills for Step 5 records; preserve original snapshots and clock starts.
  await TicketEvent.collection.updateMany({
    visibility: {
      $exists: false
    }
  }, {
    $set: {
      visibility: "PUBLIC"
    }
  });
  await Ticket.collection.updateMany({
    attachmentCount: {
      $exists: false
    }
  }, {
    $set: {
      attachmentCount: 0
    }
  });
  await Ticket.collection.updateMany({
    slaCycleNumber: {
      $exists: false
    }
  }, {
    $set: {
      slaCycleNumber: 1
    }
  });
  for await (const ticket of Ticket.find({
    workStartedAt: {
      $exists: false
    },
    status: {
      $in: ["IN_PROGRESS", "RESOLVED", "CLOSED"]
    }
  }).select("organization firstResponseAt").lean().cursor()) {
    const start = await TicketEvent.findOne({
      organization: ticket.organization,
      ticket: ticket._id,
      type: "WORK_STARTED"
    }).sort({
      occurredAt: 1
    }).lean();
    if (start) await Ticket.collection.updateOne({
      _id: ticket._id,
      workStartedAt: {
        $exists: false
      }
    }, {
      $set: {
        workStartedAt: start.occurredAt
      }
    });
  }
  for await (const ticket of Ticket.find({ firstResponseAt: { $exists: true } }).select("organization firstResponseAt").lean().cursor()) {
    await SlaCycle.collection.updateOne({
      organization: ticket.organization,
      ticket: ticket._id,
      cycleNumber: 1,
      firstResponseAt: {
        $exists: false
      }
    }, {
      $set: {
        firstResponseAt: ticket.firstResponseAt
      }
    });
  }
  // Canonicalize live configuration for future snapshots. Historical ticket
  // snapshots are deliberately never rewritten.
  for await (const policy of SlaPolicy.collection.find({})) {
    const targets = {};
    let changed = false;
    for (const [priority, target] of Object.entries(policy.targets || {})) {
      targets[priority] = {
        ...(target.responseSeconds != null || target.responseMinutes != null
          ? {
              responseSeconds:
                target.responseSeconds ?? target.responseMinutes * 60,
            }
          : {}),
        ...(target.resolutionSeconds != null || target.resolutionMinutes != null
          ? {
              resolutionSeconds:
                target.resolutionSeconds ?? target.resolutionMinutes * 60,
            }
          : {}),
      };
      if (target.responseMinutes != null || target.resolutionMinutes != null) changed = true;
    }
    await SlaPolicy.collection.updateOne(
      { _id: policy._id },
      {
        $set: {
          ...(changed ? { targets } : {}),
          revision: policy.revision || 1,
        },
      },
    );
  }
  await BusinessCalendar.collection.updateMany(
    { revision: { $exists: false } },
    { $set: { revision: 1 } },
  );
  await SlaCycle.collection.updateMany(
    { clockRevision: { $exists: false } },
    {
      $set: {
        clockRevision: 0,
        responseEvaluationComplete: false,
        resolutionEvaluationComplete: false,
      },
    },
  );
  await SlaCycle.collection.updateMany(
    { endedAt: { $exists: false }, isOpen: { $exists: false } },
    { $set: { isOpen: true } },
  );
  await SlaCycle.collection.updateMany(
    { endedAt: { $exists: true }, isOpen: { $exists: false } },
    { $set: { isOpen: false } },
  );
  // Additive only: never drop existing indexes in an operational database.
  for (const Model of Object.values(mongoose.models)) {
    await Model.createCollection();
    await Model.createIndexes();
  }
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/create-indexes.js")) {
  try {
    await connectDatabase();
    await createIndexes();
    console.log("Collections and indexes created.");
  } finally {
    await disconnectDatabase();
  }
}
