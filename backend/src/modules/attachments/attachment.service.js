import mongoose from "mongoose";
import { Attachment } from "./attachment.model.js";
import { Ticket } from "../tickets/ticket.model.js";
import { TicketComment } from "../tickets/ticketComment.model.js";
import { canViewInternal, TERMINAL_STATUSES } from "../tickets/ticket.policy.js";
import { loadAccessibleTicket, requireDiscussionAccess, ticketNotFound, bumpTicket, recordTicketChange, conflict } from "../tickets/ticketOperations.service.js";
import { currentAccess } from "../access/currentAccess.service.js";
import { executeCommand } from "../../shared/database/command.js";
import { findIdempotencyRecord, assertIdempotencyInput, requestDigest } from "../../shared/database/idempotency.js";
import { runRequiredTransaction } from "../../shared/database/transaction.js";
import { localStorage } from "../../adapters/storage/localStorage.adapter.js";
import { scanBuffer } from "../../adapters/scanning/clamav.adapter.js";
import { storageConfig } from "../../config/storage.js";
import { AppError } from "../../shared/errors/app-error.js";
import { idOf } from "../../shared/validation/commands.js";
function serialize(row) {
  return {
    id: idOf(row),
    commentId: idOf(row.comment) || null,
    filename: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    visibility: row.visibility,
    state: row.state,
    scanStatus: row.scanStatus,
    createdAt: row.createdAt
  };
}
async function authorizeParent(auth, ticket, input, session) {
  requireDiscussionAccess(auth, ticket, input.visibility);
  if (TERMINAL_STATUSES.includes(ticket.status) || ticket.status === "RESOLVED") conflict("Attachments require an active ticket.");
  if (input.commentId) {
    const comment = await TicketComment.findOne({
      _id: input.commentId,
      organization: ticket.organization,
      ticket: ticket._id,
      ...(canViewInternal(auth, ticket) ? {} : {
        visibility: "PUBLIC"
      })
    }).session(session);
    if (!comment) throw ticketNotFound();
    if (comment.visibility === "INTERNAL" && input.visibility !== "INTERNAL") throw new AppError(400, "VISIBILITY_CONFLICT", "Attachment visibility cannot exceed its parent.");
  }
}
export async function attachmentMetadata(authentication, id, includeStorage = false) {
  const auth = await currentAccess(authentication);
  if (!mongoose.isObjectIdOrHexString(id)) throw ticketNotFound();
  const query = Attachment.findOne({
    _id: id,
    organization: auth.user.organizationId
  });
  if (includeStorage) query.select("+storageName");
  const row = await query;
  if (!row) throw ticketNotFound();
  const ticket = await loadAccessibleTicket(auth, row.ticket);
  if (row.visibility === "INTERNAL" && !canViewInternal(auth, ticket)) throw ticketNotFound();
  if (row.comment && !(await TicketComment.exists({
    _id: row.comment,
    organization: row.organization,
    ticket: row.ticket,
    ...(canViewInternal(auth, ticket) ? {} : {
      visibility: "PUBLIC"
    })
  }))) throw ticketNotFound();
  return includeStorage ? row : serialize(row);
}
export async function listAttachments(authentication, ticketId, pagination) {
  const auth = await currentAccess(authentication),
    ticket = await loadAccessibleTicket(auth, ticketId);
  const filter = {
    organization: ticket.organization,
    ticket: ticket._id,
    ...(canViewInternal(auth, ticket) ? {} : {
      visibility: "PUBLIC"
    })
  };
  // Parent visibility is immutable and enforced when the reservation is made.
  const [rows, total] = await Promise.all([Attachment.find(filter).sort({
    createdAt: 1,
    _id: 1
  }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit), Attachment.countDocuments(filter)]);
  return {
    attachments: rows.map(serialize),
    pagination: {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.limit)
    }
  };
}
async function rejectReservation(id, scanStatus, targetState = "REJECTED") {
  return runRequiredTransaction(async session => {
    const row = await Attachment.findOne({
      _id: id,
      state: "PENDING"
    }).select("+storageName").session(session);
    if (!row) return false;
    const ticket = await Ticket.findOne({
      _id: row.ticket,
      organization: row.organization
    }).session(session);
    await Attachment.updateOne({
      _id: id,
      state: "PENDING"
    }, {
      $set: {
        state: targetState,
        scanStatus
      }
    }, {
      session
    });
    if (ticket) {
      const changed = await Ticket.updateOne({
        _id: ticket._id,
        attachmentCount: {
          $gt: 0
        }
      }, {
        $inc: {
          attachmentCount: -1,
          version: 1
        }
      }, {
        session
      });
      if (changed.modifiedCount !== 1) throw new Error("Missing attachment reservation count.");
      // System compensation uses the original uploader as the attributable actor, never a public preview.
      await recordTicketChange({
        auth: {
          user: {
            id: row.uploader
          },
          session: {}
        },
        ticket,
        type: `ATTACHMENT_${targetState}`,
        visibility: row.visibility,
        data: {
          attachmentId: idOf(row)
        },
        session
      });
    }
    return true;
  });
}
export async function uploadAttachment({
  authentication,
  ticketId,
  input,
  buffer,
  idempotencyKey,
  metadata
}) {
  const preflight = await currentAccess(authentication);
  const prior = await findIdempotencyRecord({
    organization: preflight.user.organizationId,
    user: preflight.user.id,
    operation: `ticket:attachment:${ticketId}`,
    key: idempotencyKey
  });
  assertIdempotencyInput(prior, requestDigest(input));
  if (prior) {
    const attachment = await attachmentMetadata(preflight, prior.resourceId);
    if (attachment.state !== "READY") throw new AppError(409, "ATTACHMENT_NOT_READY", "This upload is pending or failed. Refresh its metadata before retrying with a new key.");
    return {
      status: prior.responseStatus,
      replayed: true,
      data: {
        attachment
      }
    };
  }
  await authorizeParent(preflight, await loadAccessibleTicket(preflight, ticketId), input, null);
  const storageName = await localStorage.temporary(buffer);
  let reservedId,
    committed = false;
  try {
    const reservation = await executeCommand({
      authentication,
      operation: `ticket:attachment:${ticketId}`,
      key: idempotencyKey,
      input,
      resourceType: "ATTACHMENT",
      status: 201,
      read: async id => ({
        attachment: await attachmentMetadata(authentication, id)
      }),
      work: async session => {
        const auth = await currentAccess(authentication, session),
          ticket = await loadAccessibleTicket(auth, ticketId, session);
        await authorizeParent(auth, ticket, input, session);
        if ((ticket.attachmentCount || 0) >= 5) throw new AppError(409, "ATTACHMENT_LIMIT", "At most five attachments, including pending uploads, are allowed.");
        await bumpTicket(ticket, input.expectedVersion, {}, session, {
          attachmentCount: 1
        });
        const [row] = await Attachment.create([{
          organization: ticket.organization,
          ticket: ticket._id,
          comment: input.commentId,
          uploader: auth.user.id,
          visibility: input.visibility,
          originalName: input.originalName,
          mimeType: input.mimeType,
          size: input.size,
          sha256: input.sha256,
          storageName,
          state: "PENDING",
          scanStatus: storageConfig().scanning ? "PENDING" : "NOT_CONFIGURED"
        }], {
          session
        });
        await recordTicketChange({
          auth,
          ticket,
          type: "ATTACHMENT_RESERVED",
          data: {
            attachmentId: idOf(row)
          },
          visibility: input.visibility,
          metadata,
          session
        });
        return row._id;
      }
    });
    if (reservation.replayed) {
      if (reservation.data.attachment.state !== "READY") throw new AppError(409, "ATTACHMENT_NOT_READY", "This upload is pending or failed. Refresh its metadata before retrying with a new key.");
      return reservation;
    }
    reservedId = reservation.data.attachment.id;
    let scanStatus;
    try {
      scanStatus = await scanBuffer(buffer);
    } catch {
      await rejectReservation(reservedId, "ERROR");
      throw new AppError(503, "SCANNER_UNAVAILABLE", "Scanning failed; the attachment is unavailable.");
    }
    if (scanStatus === "INFECTED") {
      await rejectReservation(reservedId, scanStatus);
      throw new AppError(422, "ATTACHMENT_REJECTED", "The scanner rejected the attachment.");
    }
    await localStorage.finalize(storageName);
    await runRequiredTransaction(async session => {
      const auth = await currentAccess(authentication, session),
        ticket = await loadAccessibleTicket(auth, ticketId, session);
      await authorizeParent(auth, ticket, input, session);
      const result = await Attachment.updateOne({
        _id: reservedId,
        organization: ticket.organization,
        state: "PENDING"
      }, {
        $set: {
          state: "READY",
          scanStatus
        }
      }, {
        session,
        runValidators: true
      });
      if (result.modifiedCount !== 1) conflict("The attachment reservation is no longer pending.");
      // Take a ticket write lock so cancellation/reassignment cannot pass final authorization concurrently.
      await Ticket.updateOne({
        _id: ticket._id,
        version: ticket.version
      }, {
        $inc: {
          version: 1
        }
      }, {
        session
      });
      await recordTicketChange({
        auth,
        ticket,
        type: "ATTACHMENT_READY",
        visibility: input.visibility,
        data: {
          attachmentId: reservedId
        },
        metadata,
        session
      });
    });
    committed = true;
    return {
      status: 201,
      replayed: false,
      data: {
        attachment: await attachmentMetadata(authentication, reservedId)
      }
    };
  } catch (error) {
    if (reservedId && !committed) {
      const rejected = await rejectReservation(reservedId, "ERROR").catch(() => false);
      // If compensation cannot commit, retain files for the pending-reservation cleanup job.
      const row = await Attachment.findById(reservedId).catch(() => null);
      if (rejected || ["REJECTED", "DELETED"].includes(row?.state)) await localStorage.remove(storageName).catch(() => {});
    }
    if (error instanceof AppError) throw error;
    throw new AppError(503, "ATTACHMENT_FINALIZATION_FAILED", "The upload could not be finalized. The ticket remains intact.");
  } finally {
    await localStorage.removeTemporary(storageName).catch(() => {});
  }
}
export async function downloadAttachment(authentication, id) {
  const row = await attachmentMetadata(authentication, id, true);
  if (row.state !== "READY" || !["CLEAN", "NOT_CONFIGURED"].includes(row.scanStatus) || storageConfig().scanning && row.scanStatus !== "CLEAN") throw new AppError(409, "ATTACHMENT_NOT_READY", "This attachment is unavailable.");
  let buffer;
  try {
    buffer = await localStorage.read(row.storageName);
  } catch {
    throw new AppError(503, "ATTACHMENT_UNAVAILABLE", "Attachment content is temporarily unavailable.");
  }
  await attachmentMetadata(authentication, id); // Recheck after filesystem I/O.
  return {
    metadata: serialize(row),
    buffer
  };
}
export async function cleanupAttachments({
  olderThan = new Date(Date.now() - 3600000),
  limit = 100
} = {}) {
  let reservations = 0,
    files = 0;
  const pending = await Attachment.find({
    state: "PENDING",
    updatedAt: {
      $lt: olderThan
    }
  }).select("+storageName").limit(limit);
  for (const row of pending) if (await rejectReservation(row._id, "ERROR", "DELETED")) {
    await localStorage.remove(row.storageName);
    reservations++;
  }
  for (const name of await localStorage.oldFiles(olderThan, limit)) {
    if (!(await Attachment.exists({
      storageName: name,
      state: {
        $in: ["PENDING", "READY"]
      }
    }))) {
      await localStorage.remove(name);
      files++;
    }
  }
  return {
    reservations,
    orphanFiles: files
  };
}
