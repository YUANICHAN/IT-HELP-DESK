import { idOf } from "../../shared/validation/commands.js";

// Deliberately independent of staff ticket serialization and related-record loading.
export function serializeApproval(approval, ticket, {
  triage = false
} = {}) {
  return {
    id: idOf(approval),
    round: approval.round,
    approverId: idOf(approval.approver),
    status: approval.status,
    requestedAt: approval.requestedAt,
    decidedAt: approval.decidedAt || null,
    decidedBy: idOf(approval.decidedBy) || null,
    decisionNote: approval.decisionNote || null,
    supersededAt: approval.supersededAt || null,
    ...(triage ? {
      supersededReason: approval.supersededReason || null,
      supersededBy: idOf(approval.supersededBy) || null
    } : {}),
    ticket: {
      id: idOf(ticket),
      reference: ticket.reference,
      title: ticket.title,
      description: ticket.description,
      requesterId: idOf(ticket.requester),
      requesterDepartmentId: idOf(ticket.requesterDepartment),
      status: ticket.status,
      type: ticket.type,
      priority: ticket.priority,
      urgency: ticket.urgency,
      approvalRequired: ticket.approvalRequired,
      approvalStatus: ticket.approvalStatus,
      currentApprovalRound: ticket.currentApprovalRound,
      version: ticket.version,
      submittedAt: ticket.submittedAt,
      service: {
        id: idOf(ticket.serviceItem),
        name: ticket.configurationSnapshots.service.name,
        code: ticket.configurationSnapshots.service.code
      }
    }
  };
}
