import { requireExactObject } from "../../shared/http/request-validation.js";
import { choice, date, invalid, objectId, text, version } from "../../shared/validation/commands.js";
import { validateTimelineQuery } from "../tickets/ticket.validation.js";
import { APPROVAL_STATUSES } from "./approval.model.js";
export function validateDecision(body) {
  requireExactObject(body, ["decision", "expectedVersion", "decisionNote"], ["decision", "expectedVersion"]);
  const decision = choice(body.decision, ["APPROVED", "REJECTED"], "decision");
  return {
    decision,
    expectedVersion: version(body.expectedVersion),
    decisionNote: body.decisionNote === undefined && decision === "APPROVED" ? null : text(body.decisionNote, "decisionNote", 1, 2000)
  };
}
export function validateReroute(body) {
  requireExactObject(body, ["approverId", "expectedVersion", "reason"], ["approverId", "expectedVersion", "reason"]);
  return {
    approverId: objectId(body.approverId, "approverId"),
    expectedVersion: version(body.expectedVersion),
    reason: text(body.reason, "reason", 1, 2000)
  };
}
export function validateApprovalQuery(query) {
  if (Object.keys(query).some(key => !["page", "limit", "status", "from", "to", "sort"].includes(key))) invalid("The query contains unsupported fields.");
  const pagination = validateTimelineQuery({
    page: query.page,
    limit: query.limit
  });
  const status = query.status === undefined ? "PENDING" : choice(query.status, APPROVAL_STATUSES, "status");
  const from = query.from === undefined ? null : date(query.from, "from");
  const to = query.to === undefined ? null : date(query.to, "to");
  if (from && to && from > to) invalid("from must not be later than to.");
  const sorts = {
    requestedAt: {
      requestedAt: 1,
      _id: 1
    },
    "-requestedAt": {
      requestedAt: -1,
      _id: -1
    },
    decidedAt: {
      decidedAt: 1,
      _id: 1
    },
    "-decidedAt": {
      decidedAt: -1,
      _id: -1
    }
  };
  const sort = query.sort ?? "-requestedAt";
  if (typeof sort !== "string" || !Object.hasOwn(sorts, sort)) invalid("Sort is not supported.");
  return {
    ...pagination,
    status,
    from,
    to,
    sort: sorts[sort]
  };
}
