import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import "../src/app.js";
import mongoose from "mongoose";
import { Ticket } from "../src/modules/tickets/ticket.model.js";
import { TicketEvent } from "../src/modules/tickets/ticketEvent.model.js";
import { SlaCycle } from "../src/modules/service-levels/slaCycle.model.js";
import { SlaPolicy } from "../src/modules/service-levels/slaPolicy.model.js";
import { BusinessCalendar } from "../src/modules/service-levels/businessCalendar.model.js";
import "../src/modules/service-levels/slaBreach.model.js";
export async function createIndexes() {
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
