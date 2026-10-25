import { listApprovals, decideApproval, rerouteApproval, approvalHistory } from "./approvals.service.js";
import { validateApprovalQuery, validateDecision, validateReroute } from "./approvals.validation.js";
import { validateTimelineQuery } from "../tickets/ticket.validation.js";
import { requireIdempotencyKey } from "../../shared/database/idempotency.js";
import { requestClientMetadata } from "../auth/session.service.js";
function send(res, result) {
  if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
  res.status(result.status).json({
    data: result.data
  });
}
export async function list(req, res) {
  res.json({
    data: await listApprovals(req.auth, validateApprovalQuery(req.query))
  });
}
export async function decision(req, res) {
  send(res, await decideApproval({
    authentication: req.auth,
    approvalId: req.params.approvalId,
    input: validateDecision(req.body),
    idempotencyKey: requireIdempotencyKey(req),
    metadata: requestClientMetadata(req)
  }));
}
export async function reroute(req, res) {
  send(res, await rerouteApproval({
    authentication: req.auth,
    ticketId: req.params.ticketId,
    input: validateReroute(req.body),
    idempotencyKey: requireIdempotencyKey(req),
    metadata: requestClientMetadata(req)
  }));
}
export async function history(req, res) {
  res.json({
    data: await approvalHistory(req.auth, req.params.ticketId, validateTimelineQuery(req.query))
  });
}
