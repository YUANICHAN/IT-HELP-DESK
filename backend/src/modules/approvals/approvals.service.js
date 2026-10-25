import mongoose from "mongoose";
import { Approval } from "./approval.model.js";
import { approvalConflict, approvalNotFound, eligibleApprover, hasApprovalScope, isNamedApprover, requirePendingRound } from "./approval.policy.js";
import { createApproval, endApprovalPause, supersedeApproval } from "./approvalLifecycle.service.js";
import { serializeApproval } from "./approval.serializer.js";
import { currentAccess } from "../access/currentAccess.service.js";
import { Ticket } from "../tickets/ticket.model.js";
import { SlaCycle } from "../service-levels/slaCycle.model.js";
import { bumpTicket, loadAccessibleTicket, recordTicketChange } from "../tickets/ticketOperations.service.js";
import { canTriage } from "../tickets/ticket.policy.js";
import { executeCommand } from "../../shared/database/command.js";
import { AppError } from "../../shared/errors/app-error.js";
import { same } from "../../shared/validation/commands.js";
async function namedApproval(auth, id, session = null) {
  if (!mongoose.isObjectIdOrHexString(id)) throw approvalNotFound();
  const approval = await Approval.findOne({
    _id: id,
    organization: auth.user.organizationId,
    approver: auth.user.id
  }).session(session);
  const ticket = approval && (await Ticket.findOne({
    _id: approval.ticket,
    organization: auth.user.organizationId
  }).session(session));
  if (!ticket || !isNamedApprover(auth, ticket, approval)) throw approvalNotFound();
  return {
    approval,
    ticket
  };
}
export async function listApprovals(authentication, filters) {
  const auth = await currentAccess(authentication);
  const org = new mongoose.Types.ObjectId(auth.user.organizationId),
    user = new mongoose.Types.ObjectId(auth.user.id);
  const grants = auth.user.role === "SUPERVISOR" ? auth.permissions.filter(g => ["department_supervise", "ticket_triage"].includes(g.capability)) : [];
  const departments = grants.filter(g => g.scope.type === "DEPARTMENT").map(g => new mongoose.Types.ObjectId(g.scope.departmentId));
  const organizationWide = grants.some(g => g.scope.type === "ORGANIZATION");
  const scope = organizationWide ? {} : {
    "ticket.requesterDepartment": {
      $in: departments
    }
  };
  const [result] = await Approval.aggregate([{
    $match: {
      organization: org,
      approver: user,
      status: filters.status,
      ...(filters.from || filters.to ? {
        requestedAt: {
          ...(filters.from ? {
            $gte: filters.from
          } : {}),
          ...(filters.to ? {
            $lte: filters.to
          } : {})
        }
      } : {})
    }
  }, {
    $lookup: {
      from: Ticket.collection.name,
      localField: "ticket",
      foreignField: "_id",
      as: "ticket"
    }
  }, {
    $unwind: "$ticket"
  }, {
    $match: {
      ...scope,
      "ticket.organization": org,
      "ticket.requester": {
        $ne: user
      },
      "ticket.type": "REQUEST",
      "ticket.approvalRequired": true,
      ...(filters.status === "PENDING" ? {
        "ticket.status": "WAITING_APPROVAL",
        "ticket.approvalStatus": "PENDING",
        $expr: {
          $eq: ["$round", "$ticket.currentApprovalRound"]
        }
      } : {})
    }
  },
  // Access and current-round checks precede both the count and the page.
  {
    $facet: {
      rows: [{
        $sort: filters.sort
      }, {
        $skip: (filters.page - 1) * filters.limit
      }, {
        $limit: filters.limit
      }],
      count: [{
        $count: "total"
      }]
    }
  }]);
  const total = result.count[0]?.total || 0;
  return {
    approvals: result.rows.map(row => serializeApproval(row, row.ticket)),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit)
    }
  };
}
export async function decideApproval({
  authentication,
  approvalId,
  input,
  idempotencyKey,
  metadata
}) {
  await namedApproval(await currentAccess(authentication), approvalId);
  return executeCommand({
    authentication,
    operation: `approval:decision:${approvalId}`,
    key: idempotencyKey,
    input,
    resourceType: "APPROVAL",
    read: async id => {
      const {
        approval,
        ticket
      } = await namedApproval(await currentAccess(authentication), id);
      return {
        approval: serializeApproval(approval, ticket)
      };
    },
    work: async session => {
      const auth = await currentAccess(authentication, session);
      const {
        approval,
        ticket
      } = await namedApproval(auth, approvalId, session);
      requirePendingRound(ticket, approval);
      if (!(await SlaCycle.exists({
        organization: ticket.organization,
        ticket: ticket._id,
        cycleNumber: ticket.slaCycleNumber,
        endedAt: {
          $exists: false
        }
      }).session(session))) approvalConflict();
      const now = new Date();
      const updated = await bumpTicket(ticket, input.expectedVersion, {
        status: input.decision === "APPROVED" ? "OPEN" : "REJECTED",
        approvalStatus: input.decision
      }, session);
      const result = await Approval.updateOne({
        _id: approval._id,
        organization: ticket.organization,
        status: "PENDING"
      }, {
        $set: {
          status: input.decision,
          decidedAt: now,
          decidedBy: auth.user.id,
          decisionNote: input.decisionNote
        }
      }, {
        session,
        runValidators: true
      });
      if (result.matchedCount !== 1) approvalConflict();
      await endApprovalPause(ticket, now, session);
      if (input.decision === "REJECTED") {
        const ended = await SlaCycle.updateOne({
          organization: ticket.organization,
          ticket: ticket._id,
          cycleNumber: ticket.slaCycleNumber,
          endedAt: {
            $exists: false
          }
        }, {
          $set: {
            endedAt: now,
            endReason: "REJECTED"
          }
        }, {
          session,
          runValidators: true
        });
        if (ended.matchedCount !== 1) approvalConflict();
      }
      await recordTicketChange({
        auth,
        ticket: updated,
        type: `APPROVAL_${input.decision}`,
        data: {
          approvalId: approval.id,
          round: approval.round,
          previousStatus: ticket.status,
          status: updated.status
        },
        recipients: {
          userIds: [ticket.requester, approval.approver],
          capability: "ticket_triage",
          department: ticket.requesterDepartment
        },
        metadata,
        session
      });
      return approval._id;
    }
  });
}
async function triageTicket(authentication, ticketId, session = null) {
  const auth = await currentAccess(authentication, session);
  const ticket = await loadAccessibleTicket(auth, ticketId, session);
  if (!canTriage(auth, ticket)) throw approvalNotFound();
  return {
    auth,
    ticket
  };
}
export async function rerouteApproval({
  authentication,
  ticketId,
  input,
  idempotencyKey,
  metadata
}) {
  await triageTicket(authentication, ticketId);
  return executeCommand({
    authentication,
    operation: `approval:reroute:${ticketId}`,
    key: idempotencyKey,
    input,
    resourceType: "APPROVAL",
    read: async id => {
      const {
        ticket
      } = await triageTicket(authentication, ticketId);
      const approval = await Approval.findOne({
        _id: id,
        organization: ticket.organization,
        ticket: ticket._id
      });
      if (!approval) throw approvalNotFound();
      return {
        approval: serializeApproval(approval, ticket, {
          triage: true
        })
      };
    },
    work: async session => {
      const {
        auth,
        ticket
      } = await triageTicket(authentication, ticketId, session);
      // Check the version before replacement validation: a retried concurrent reroute
      // may already have selected this approver and must recover its idempotency result.
      if (ticket.version !== input.expectedVersion) throw new AppError(409, "STALE_TICKET_VERSION", "The ticket changed. Refresh it and retry.");
      if (!(await eligibleApprover(ticket, input.approverId, session))) throw new AppError(422, "APPROVER_UNAVAILABLE", "Replacement must be an eligible supervisor other than the requester.");
      const old = await Approval.findOne({
        organization: ticket.organization,
        ticket: ticket._id,
        round: ticket.currentApprovalRound
      }).session(session);
      requirePendingRound(ticket, old);
      if (same(old.approver, input.approverId)) throw new AppError(422, "APPROVER_UNCHANGED", "Select a different eligible approver.");
      const now = new Date();
      const updated = await bumpTicket(ticket, input.expectedVersion, {
        currentApprovalRound: ticket.currentApprovalRound + 1
      }, session);
      await supersedeApproval(ticket, auth.user.id, input.reason, now, session);
      const approval = await createApproval(updated, input.approverId, now, session);
      await recordTicketChange({
        auth,
        ticket: updated,
        type: "APPROVAL_REROUTED",
        visibility: "INTERNAL",
        notificationVisibility: "PUBLIC",
        data: {
          previousApprovalId: old.id,
          approvalId: approval.id,
          round: approval.round,
          reason: input.reason
        },
        recipients: {
          userIds: [ticket.requester, approval.approver],
          capability: "ticket_triage",
          department: ticket.requesterDepartment
        },
        metadata,
        session
      });
      return approval._id;
    }
  });
}
export async function approvalHistory(authentication, ticketId, pagination) {
  const auth = await currentAccess(authentication),
    ticket = await loadAccessibleTicket(auth, ticketId);
  const triage = canTriage(auth, ticket),
    requester = same(ticket.requester, auth.user.id);
  if (!requester && !triage && !hasApprovalScope(auth, ticket)) throw approvalNotFound();
  const filter = {
    organization: ticket.organization,
    ticket: ticket._id,
    ...(!requester && !triage ? {
      approver: auth.user.id
    } : {})
  };
  const [rows, total] = await Promise.all([Approval.find(filter).sort({
    round: 1
  }).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit), Approval.countDocuments(filter)]);
  return {
    approvals: rows.map(row => serializeApproval(row, ticket, {
      triage
    })),
    pagination: {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.limit)
    }
  };
}
