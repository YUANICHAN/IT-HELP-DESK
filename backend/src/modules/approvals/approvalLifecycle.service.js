import { Approval } from "./approval.model.js";
import { approvalConflict, requirePendingRound } from "./approval.policy.js";
import { closeResolutionPause } from "../service-levels/slaLifecycle.service.js";
export async function createApproval(ticket, approver, now, session) {
  const [approval] = await Approval.create([{
    organization: ticket.organization,
    ticket: ticket._id,
    round: ticket.currentApprovalRound,
    approver,
    status: "PENDING",
    requestedAt: now
  }], {
    session
  });
  return approval;
}
export async function endApprovalPause(ticket, now, actorId, endReason, session) {
  const closed = await closeResolutionPause(
    ticket,
    now,
    actorId,
    endReason,
    session,
  );
  if (!closed) approvalConflict();
}
export async function supersedeApproval(ticket, actorId, reason, now, session) {
  const approval = await Approval.findOne({
    organization: ticket.organization,
    ticket: ticket._id,
    round: ticket.currentApprovalRound,
    status: "PENDING"
  }).session(session);
  requirePendingRound(ticket, approval);
  const result = await Approval.updateOne({
    _id: approval._id,
    status: "PENDING"
  }, {
    $set: {
      status: "SUPERSEDED",
      supersededAt: now,
      supersededBy: actorId,
      supersededReason: reason
    }
  }, {
    session,
    runValidators: true
  });
  if (result.matchedCount !== 1) approvalConflict();
  return approval;
}
