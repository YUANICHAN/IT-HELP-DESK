import mongoose from "mongoose";
import { requireFulfillmentApproval } from "../approvals/approval.policy.js";
import { endApprovalPause, supersedeApproval } from "../approvals/approvalLifecycle.service.js";
import { AppError } from "../../shared/errors/app-error.js";
import { same, idOf } from "../../shared/validation/commands.js";
import { executeCommand } from "../../shared/database/command.js";
import { currentAccess } from "../access/currentAccess.service.js";
import { hasDepartmentCapability } from "../access/scopeFilters.js";
import { AccessGrant } from "../access/accessGrant.model.js";
import { User } from "../users/user.model.js";
import { recordRequiredAuditEvent } from "../auth/audit.service.js";
import { enqueueTicketNotifications } from "../notifications/ticketNotifications.service.js";
import { SlaCycle } from "../service-levels/slaCycle.model.js";
import { reopenDeadline } from "../service-levels/businessTime.js";
import {
  applyPriorityChange,
  closeResolutionPause,
  completeFirstResponse,
  cycleCreationFields,
  finishCycle,
  openResolutionPause,
} from "../service-levels/slaLifecycle.service.js";
import { clockNow } from "../../shared/time/clock.js";
import { Ticket } from "./ticket.model.js";
import { TicketComment } from "./ticketComment.model.js";
import { TicketEvent } from "./ticketEvent.model.js";
import { TicketWorklog } from "./ticketWorklog.model.js";
import { buildTicketAccessFilter, canTriage, canViewInternal, isAssignedTechnician, canUseSupportScope, TERMINAL_STATUSES, ACTIVE_STATUSES, PRIORITY_MATRIX } from "./ticket.policy.js";
import { serializeTicket, serializeComment } from "./ticket.serializer.js";
export function ticketNotFound() {
  return new AppError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
}
function forbidden() {
  throw new AppError(403, "FORBIDDEN", "This operation requires current ticket permission.");
}
export function conflict(message = "The ticket changed. Refresh it and retry.") {
  throw new AppError(409, "INVALID_TICKET_TRANSITION", message);
}
export async function loadAccessibleTicket(auth, id, session = null) {
  if (!mongoose.isObjectIdOrHexString(id)) throw ticketNotFound();
  const ticket = await Ticket.findOne({
    $and: [{
      _id: id
    }, buildTicketAccessFilter(auth)]
  }).session(session);
  if (!ticket) throw ticketNotFound();
  return ticket;
}
export async function eligibleAssignee(ticket, userId, session) {
  if (!userId) return false;
  const user = await User.findOne({
    _id: userId,
    organization: ticket.organization,
    role: "TECHNICIAN",
    accountStatus: "ACTIVE"
  }).session(session);
  return Boolean(user && (await AccessGrant.exists({
    organization: ticket.organization,
    user: userId,
    capability: "support",
    isActive: true,
    revokedAt: {
      $exists: false
    },
    $or: [{
      department: ticket.requesterDepartment
    }, {
      department: null
    }]
  }).session(session)));
}
export function requireDiscussionAccess(auth, ticket, visibility) {
  if (visibility === "INTERNAL") {
    if (!canViewInternal(auth, ticket)) throw ticketNotFound();
  } else if (!same(ticket.requester, auth.user.id) && !canTriage(auth, ticket) && !isAssignedTechnician(auth, ticket) && !hasDepartmentCapability(auth, "department_supervise", ticket.requesterDepartment)) forbidden();
}
export async function recordTicketChange({
  auth,
  ticket,
  type,
  data = {},
  visibility = "PUBLIC",
  metadata = {},
  session
}) {
  const occurredAt = clockNow();
  const [event] = await TicketEvent.create([{
    organization: ticket.organization,
    ticket: ticket._id,
    actor: auth.user.id,
    type,
    data,
    visibility,
    occurredAt
  }], {
    session
  });
  await recordRequiredAuditEvent({
    eventType: `TICKET_${type}`,
    outcome: "SUCCESS",
    organization: ticket.organization,
    user: auth.user.id,
    session: auth.session.id,
    department: ticket.requesterDepartment,
    ticket: ticket._id,
    ticketReference: ticket.reference,
    ...metadata
  }, session);
  await enqueueTicketNotifications({
    ticket,
    event,
    type,
    actorId: auth.user.id,
    data,
    occurredAt,
  }, session);
}
export async function bumpTicket(ticket, expectedVersion, set, session, extra = {}) {
  if (ticket.version !== expectedVersion) throw new AppError(409, "STALE_TICKET_VERSION", "The ticket changed. Refresh it and retry.");
  const updated = await Ticket.findOneAndUpdate({
    _id: ticket._id,
    organization: ticket.organization,
    version: expectedVersion,
    status: ticket.status
  }, {
    $set: set,
    $inc: {
      version: 1,
      ...extra
    }
  }, {
    session,
    returnDocument: "after",
    runValidators: true
  });
  if (!updated) conflict();
  return updated;
}
async function closePause(ticket, now, actorId, endReason, session) {
  await closeResolutionPause(ticket, now, actorId, endReason, session);
}
async function firstResponse(ticket, now, set, actorId, session) {
  if (!ticket.firstResponseAt) set.firstResponseAt = now;
  await completeFirstResponse(ticket, now, actorId, session);
}
async function publicReply(ticket, auth, body, kind, session) {
  const [comment] = await TicketComment.create([{
    organization: ticket.organization,
    ticket: ticket._id,
    author: auth.user.id,
    visibility: "PUBLIC",
    kind,
    body
  }], {
    session
  });
  return comment;
}
function serializeWorklog(log) {
  return {
    id: idOf(log),
    authorId: idOf(log.author),
    start: log.start,
    end: log.end,
    durationSeconds: log.durationSeconds,
    notes: log.notes,
    createdAt: log.createdAt
  };
}
export async function runTicketCommand({
  authentication,
  ticketId,
  action,
  input,
  idempotencyKey,
  metadata
}) {
  await loadAccessibleTicket(await currentAccess(authentication), ticketId);
  const resourceType = action === "comment" ? "COMMENT" : action === "worklog" ? "WORKLOG" : "TICKET";
  return executeCommand({
    authentication,
    operation: `ticket:${action}:${ticketId}`,
    key: idempotencyKey,
    input,
    resourceType,
    status: ["comment", "worklog"].includes(action) ? 201 : 200,
    read: async id => {
      const auth = await currentAccess(authentication);
      const ticket = await loadAccessibleTicket(auth, ticketId);
      if (action === "comment") {
        const comment = await TicketComment.findOne({
          _id: id,
          organization: ticket.organization,
          ticket: ticket._id,
          ...(canViewInternal(auth, ticket) ? {} : {
            visibility: "PUBLIC"
          })
        }).populate("author", "displayName");
        if (!comment) throw ticketNotFound();
        return {
          comment: serializeComment(comment),
          ticket: serializeTicket(auth, ticket)
        };
      }
      if (action === "worklog") {
        if (!canViewInternal(auth, ticket)) throw ticketNotFound();
        const log = await TicketWorklog.findOne({
          _id: id,
          organization: ticket.organization,
          ticket: ticket._id
        });
        if (!log) throw ticketNotFound();
        return {
          worklog: serializeWorklog(log),
          ticket: serializeTicket(auth, ticket)
        };
      }
      return {
        ticket: serializeTicket(auth, ticket)
      };
    },
    work: async session => {
      const auth = await currentAccess(authentication, session);
      const ticket = action === "claim" ? await Ticket.findOne({
        _id: ticketId,
        organization: auth.user.organizationId
      }).session(session) : await loadAccessibleTicket(auth, ticketId, session);
      if (!ticket || action === "claim" && !canUseSupportScope(auth, ticket.requesterDepartment)) throw ticketNotFound();
      if (ticket.version !== input.expectedVersion) throw new AppError(409, "STALE_TICKET_VERSION", "The ticket changed. Refresh it and retry.");
      if (TERMINAL_STATUSES.includes(ticket.status)) conflict("Terminal tickets cannot be changed. Create a linked follow-up.");
      const triage = canTriage(auth, ticket),
        assigned = isAssignedTechnician(auth, ticket),
        requester = same(ticket.requester, auth.user.id);
      const now = clockNow(),
        set = {},
        data = {};
      let type,
        visibility = "PUBLIC",
        resourceId = ticket._id;
      const requireActive = () => {
        if (!ACTIVE_STATUSES.includes(ticket.status)) conflict("This command requires an active ticket.");
      };
      if (["triage", "claim", "assignment", "start", "wait", "resume", "resolve", "worklog", "reopen"].includes(action) ||
          (action === "comment" && requester && input.visibility === "PUBLIC" && ticket.status === "WAITING_REQUESTER")) {
        await requireFulfillmentApproval(ticket, session);
      }
      if (action === "patch") {
        requireActive();
        if (!(requester && ["NEW", "OPEN"].includes(ticket.status) && !ticket.workStartedAt) && !triage) forbidden();
        if (triage && !input.reason) throw new AppError(400, "REASON_REQUIRED", "Triage edits require a reason.");
        for (const field of ["title", "description"]) if (input[field] !== undefined) {
          set[field] = input[field];
          data[field] = {
            before: ticket[field],
            after: input[field]
          };
        }
        type = "UPDATED";
      } else if (action === "triage") {
        requireActive();
        if (!triage) forbidden();
        const categories = ticket.configurationSnapshots.service.configuration?.categories || ["HARDWARE", "SOFTWARE", "NETWORK", "ACCESS", "OTHER"];
        if (!categories.includes(input.category)) throw new AppError(422, "CATEGORY_UNAVAILABLE", "Category is not allowed by the ticket's service snapshot.");
        const urgency = input.urgency || ticket.urgency,
          calculated = PRIORITY_MATRIX[input.impact][urgency];
        if (input.priority && input.priority !== calculated && !input.reason) throw new AppError(400, "REASON_REQUIRED", "A priority override requires a reason.");
        Object.assign(set, {
          category: input.category,
          impact: input.impact,
          urgency,
          priority: input.priority || calculated
        });
        if (ticket.status === "NEW") set.status = "OPEN";
        Object.assign(data, {
          changes: set,
          previous: {
            category: ticket.category,
            impact: ticket.impact,
            urgency: ticket.urgency,
            priority: ticket.priority
          },
          calculatedPriority: calculated
        });
        if ((input.priority || calculated) !== ticket.priority) {
          data.slaPriorityChange = await applyPriorityChange(
            ticket,
            input.priority || calculated,
            auth.user.id,
            input.reason || "Triage recalculation",
            now,
            session,
          );
        }
        type = "TRIAGED";
      } else if (action === "claim" || action === "assignment") {
        requireActive();
        let assignee = input.assigneeId;
        if (action === "claim") {
          if (!canUseSupportScope(auth, ticket.requesterDepartment)) forbidden();
          if (ticket.assignee || !["NEW", "OPEN"].includes(ticket.status)) conflict("Only unassigned NEW or OPEN work can be claimed.");
          assignee = auth.user.id;
        } else if (!triage) forbidden();
        if (assignee && !(await eligibleAssignee(ticket, assignee, session))) throw new AppError(422, "ASSIGNEE_UNAVAILABLE", "Assignee must be an active technician supporting the original department.");
        set.assignee = assignee;
        if (action === "claim" && ticket.status === "NEW") set.status = "OPEN";
        if (!assignee && ["IN_PROGRESS", "WAITING_REQUESTER", "WAITING_VENDOR"].includes(ticket.status)) {
          set.status = "OPEN";
          await closePause(ticket, now, auth.user.id, "UNASSIGNED", session);
        }
        Object.assign(data, {
          previousAssigneeId: idOf(ticket.assignee) || null,
          assigneeId: assignee,
          status: set.status || ticket.status
        });
        type = action === "claim" ? "CLAIMED" : "ASSIGNED";
      } else if (action === "start") {
        if (!assigned) forbidden();
        if (ticket.status !== "OPEN") conflict("Only OPEN tickets can be started.");
        set.status = "IN_PROGRESS";
        if (!ticket.workStartedAt) set.workStartedAt = now;
        type = "WORK_STARTED";
      } else if (action === "wait") {
        if (!assigned) forbidden();
        if (ticket.status !== "IN_PROGRESS") conflict("Only active work can enter a waiting state.");
        set.status = input.status;
        const comment = await publicReply(ticket, auth, input.nextStep, "REPLY", session);
        await firstResponse(ticket, now, set, auth.user.id, session);
        if (input.status === "WAITING_REQUESTER") {
          await openResolutionPause(
            ticket,
            "WAITING_REQUESTER",
            now,
            auth.user.id,
            session,
          );
        }
        data.commentId = idOf(comment);
        type = "WAITING";
      } else if (action === "resume") {
        if (!assigned) forbidden();
        if (!["WAITING_REQUESTER", "WAITING_VENDOR"].includes(ticket.status)) conflict("Only waiting work can resume.");
        if (ticket.status === "WAITING_VENDOR") {
          if (!input.dependencyUpdate) throw new AppError(400, "DEPENDENCY_UPDATE_REQUIRED", "A dependency update is required.");
          const comment = await publicReply(ticket, auth, input.dependencyUpdate, "REPLY", session);
          data.commentId = idOf(comment);
          await firstResponse(ticket, now, set, auth.user.id, session);
        }
        await closePause(ticket, now, auth.user.id, "RESUMED", session);
        set.status = "IN_PROGRESS";
        type = "RESUMED";
      } else if (action === "comment") {
        requireDiscussionAccess(auth, ticket, input.visibility);
        const [comment] = await TicketComment.create([{
          organization: ticket.organization,
          ticket: ticket._id,
          author: auth.user.id,
          visibility: input.visibility,
          body: input.body
        }], {
          session
        });
        resourceId = comment._id;
        data.commentId = idOf(comment);
        visibility = input.visibility;
        type = visibility === "INTERNAL" ? "INTERNAL_NOTE_ADDED" : "PUBLIC_REPLY_ADDED";
        if (visibility === "PUBLIC" && !requester && (assigned || triage)) {
          await firstResponse(ticket, now, set, auth.user.id, session);
        }
        if (visibility === "PUBLIC" && requester && ticket.status === "WAITING_REQUESTER") {
          set.status = (await eligibleAssignee(ticket, ticket.assignee, session)) ? "IN_PROGRESS" : "OPEN";
          if (set.status === "OPEN") set.assignee = null;
          await closePause(ticket, now, auth.user.id, "REQUESTER_REPLIED", session);
        }
      } else if (action === "worklog") {
        if (!assigned) forbidden();
        if (!["IN_PROGRESS", "WAITING_REQUESTER", "WAITING_VENDOR"].includes(ticket.status)) conflict("Worklogs require started, active work.");
        const [log] = await TicketWorklog.create([{
          organization: ticket.organization,
          ticket: ticket._id,
          author: auth.user.id,
          start: input.start,
          end: input.end,
          notes: input.notes,
          durationSeconds: (input.end - input.start) / 1000
        }], {
          session
        });
        resourceId = log._id;
        data.worklogId = idOf(log);
        type = "WORKLOG_ADDED";
        visibility = "INTERNAL";
      } else if (action === "cancel") {
        if (!triage && !(requester && ["NEW", "OPEN", "WAITING_APPROVAL"].includes(ticket.status) && !ticket.workStartedAt)) forbidden();
        if (![...ACTIVE_STATUSES, "WAITING_APPROVAL"].includes(ticket.status)) conflict("Only non-resolved active tickets can be cancelled.");
        if (ticket.approvalStatus === "PENDING" || ticket.status === "WAITING_APPROVAL") {
          const approval = await supersedeApproval(ticket, auth.user.id, input.reason, now, session);
          await endApprovalPause(
            ticket,
            now,
            auth.user.id,
            "CANCELLED",
            session,
          );
          set.approvalStatus = "SUPERSEDED";
          await recordTicketChange({ auth, ticket, type: "APPROVAL_SUPERSEDED",
            data: { approvalId: approval.id, round: approval.round },
            recipients: { userIds: [ticket.requester, approval.approver], capability: "ticket_triage", department: ticket.requesterDepartment }, metadata, session });
        }
        set.status = "CANCELLED";
        set.cancelledAt = now;
        await closePause(ticket, now, auth.user.id, "CANCELLED", session);
        await finishCycle(ticket, now, "CANCELLED", auth.user.id, session);
        type = "CANCELLED";
      } else if (action === "resolve") {
        if (!assigned) forbidden();
        if (ticket.status !== "IN_PROGRESS") conflict("Only IN_PROGRESS tickets can be resolved.");
        set.status = "RESOLVED";
        set.resolution = {
          summary: input.summary,
          code: input.resolutionCode,
          resolvedBy: auth.user.id,
          resolvedAt: now
        };
        await firstResponse(ticket, now, set, auth.user.id, session);
        const comment = await publicReply(ticket, auth, input.summary, "RESOLUTION", session);
        data.commentId = idOf(comment);
        data.resolutionCode = input.resolutionCode;
        await finishCycle(ticket, now, "RESOLVED", auth.user.id, session);
        type = "RESOLVED";
      } else if (action === "close") {
        if (!requester && !triage) forbidden();
        if (ticket.status !== "RESOLVED") conflict("Only RESOLVED tickets can close.");
        if (!requester && !input.confirmationEvidence) throw new AppError(400, "CONFIRMATION_REQUIRED", "Requester confirmation evidence is required.");
        set.status = "CLOSED";
        set.closedAt = now;
        set.closedBy = auth.user.id;
        type = "CLOSED";
        if (input.confirmationEvidence) data.confirmationEvidence = input.confirmationEvidence;
      } else if (action === "reopen") {
        if (!requester && !triage) forbidden();
        if (ticket.status !== "RESOLVED") conflict("Only RESOLVED tickets can reopen.");
        if (!triage && (!input.sameIssue || now > reopenDeadline(ticket.resolution.resolvedAt, ticket.configurationSnapshots.businessCalendar))) conflict("Create a linked follow-up for different issues or after the three-business-day reopening window.");
        set.status = "OPEN";
        set.slaCycleNumber = (ticket.slaCycleNumber || 1) + 1;
        if (!(await eligibleAssignee(ticket, ticket.assignee, session))) set.assignee = null;
        // Keep the prior resolution and completed cycles as history; the new cycle owns its own clock.
        await SlaCycle.create([{
          organization: ticket.organization,
          ticket: ticket._id,
          cycleNumber: set.slaCycleNumber,
          originalSubmittedAt: ticket.submittedAt,
          startedAt: now,
          configurationSnapshots: ticket.configurationSnapshots,
          ...cycleCreationFields(ticket.configurationSnapshots, ticket.priority, now)
        }], {
          session
        });
        type = "REOPENED";
      }
      if (input.reason) data.reason = input.reason;
      // Operator reasons and confirmation evidence belong to the staff history. Public next steps are comments.
      if (["patch", "triage", "assignment", "wait", "cancel", "reopen"].includes(action) || input.confirmationEvidence) visibility = "INTERNAL";
      data.previousStatus = ticket.status;
      data.status = set.status || ticket.status;
      const updated = await bumpTicket(ticket, input.expectedVersion, set, session);
      await recordTicketChange({
        auth,
        ticket: updated,
        type,
        data,
        visibility,
        metadata,
        session
      });
      return resourceId;
    }
  });
}
export async function listWorklogs(authentication, ticketId, pagination) {
  const auth = await currentAccess(authentication),
    ticket = await loadAccessibleTicket(auth, ticketId);
  if (!canViewInternal(auth, ticket)) throw ticketNotFound();
  const filter = {
    organization: ticket.organization,
    ticket: ticket._id
  };
  const [rows, total] = await Promise.all([TicketWorklog.find(filter).sort({
    createdAt: 1,
    _id: 1
  }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit), TicketWorklog.countDocuments(filter)]);
  return {
    worklogs: rows.map(serializeWorklog),
    pagination: {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.limit)
    }
  };
}
