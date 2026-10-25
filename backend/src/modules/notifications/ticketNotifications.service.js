import { Approval } from "../approvals/approval.model.js";
import { enqueueOutboxEvent } from "../outbox/outbox.service.js";
import { idOf } from "../../shared/validation/commands.js";

function direct(userId, accessKind, visibility = "PUBLIC") {
  return userId ? { userId, accessKind, visibility, channel: "IN_APP" } : null;
}

function capability(capabilityName, department, accessKind, visibility = "PUBLIC") {
  return {
    capability: capabilityName,
    department,
    accessKind,
    visibility,
    channel: "IN_APP",
  };
}

export async function enqueueTicketNotifications({
  ticket,
  event,
  type,
  actorId,
  data = {},
  occurredAt,
}, session) {
  const directRecipients = [];
  const capabilityRecipients = [];
  const excludeUserIds = [];
  const requester = direct(ticket.requester, "TICKET_PUBLIC");
  const assignee = direct(ticket.assignee, "TICKET_INTERNAL", "INTERNAL");
  const triage = capability(
    "ticket_triage",
    ticket.requesterDepartment,
    type === "INTERNAL_NOTE_ADDED" || type.startsWith("SLA_")
      ? "TICKET_INTERNAL"
      : "TICKET_PUBLIC",
    type === "INTERNAL_NOTE_ADDED" || type.startsWith("SLA_")
      ? "INTERNAL"
      : "PUBLIC",
  );

  if (type === "CREATED") {
    directRecipients.push(requester);
    capabilityRecipients.push(triage);
  } else if (["APPROVAL_REQUESTED", "APPROVAL_REROUTED"].includes(type)) {
    const approval = data.approvalId && (await Approval.findOne({
      _id: data.approvalId,
      organization: ticket.organization,
      ticket: ticket._id,
    }).session(session).lean());
    if (approval) {
      directRecipients.push(direct(approval.approver, "TICKET_APPROVER"));
    }
  } else if (["APPROVAL_APPROVED", "APPROVAL_REJECTED"].includes(type)) {
    directRecipients.push(requester);
    capabilityRecipients.push(triage);
  } else if (type === "APPROVAL_SUPERSEDED") {
    const approval = data.approvalId && (await Approval.findById(data.approvalId)
      .session(session).lean());
    directRecipients.push(requester);
    if (approval) directRecipients.push(direct(approval.approver, "TICKET_PUBLIC"));
  } else if (["CLAIMED", "ASSIGNED"].includes(type)) {
    directRecipients.push(requester, assignee);
  } else if (type === "PUBLIC_REPLY_ADDED") {
    directRecipients.push(requester, assignee);
    capabilityRecipients.push(
      triage,
      capability(
        "department_supervise",
        ticket.requesterDepartment,
        "TICKET_PUBLIC",
      ),
    );
    excludeUserIds.push(actorId);
  } else if (type === "INTERNAL_NOTE_ADDED") {
    directRecipients.push(assignee);
    capabilityRecipients.push(triage);
    excludeUserIds.push(actorId);
  } else if (type.startsWith("SLA_")) {
    directRecipients.push(assignee);
    capabilityRecipients.push(triage);
  } else if (["WAITING", "RESOLVED", "CLOSED", "CANCELLED"].includes(type)) {
    directRecipients.push(requester, assignee);
  } else {
    directRecipients.push(requester, assignee);
  }

  return enqueueOutboxEvent({
    organization: ticket.organization,
    sourceEvent: event._id,
    eventType: `TICKET_${type}`,
    aggregateType: "TICKET",
    aggregateId: ticket._id,
    directRecipients: directRecipients.filter(Boolean),
    capabilityRecipients,
    excludeUserIds,
    metadata: {
      reference: ticket.reference,
      approvalId: data.approvalId,
      round: data.round,
      metric: data.metric,
      cycleNumber: data.cycleNumber,
    },
    occurredAt,
  }, session);
}

export function ticketNotificationDeduplicationKey(eventId, recipientId) {
  return `${idOf(eventId)}:${idOf(recipientId)}:IN_APP`;
}
