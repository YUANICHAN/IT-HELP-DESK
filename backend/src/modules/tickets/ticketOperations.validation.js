import { requireExactObject } from "../../shared/http/request-validation.js";
import { text, choice, objectId, version, date, invalid } from "../../shared/validation/commands.js";
import { RESOLUTION_CODES, TICKET_PRIORITIES, TICKET_URGENCIES } from "./ticket.model.js";
const fields = {
  patch: ["title", "description", "reason"],
  triage: ["category", "impact", "urgency", "priority", "reason"],
  assignment: ["assigneeId", "reason"],
  claim: [],
  start: [],
  wait: ["status", "reason", "nextStep"],
  resume: ["dependencyUpdate"],
  cancel: ["reason"],
  reopen: ["reason", "sameIssue"],
  resolve: ["summary", "resolutionCode"],
  close: ["confirmationEvidence"],
  comment: ["body", "visibility"],
  worklog: ["start", "end", "notes"]
};
export function validateTicketCommand(action, body) {
  requireExactObject(body, ["expectedVersion", ...fields[action]], ["expectedVersion"]);
  const result = {
    expectedVersion: version(body.expectedVersion)
  };
  for (const name of ["reason", "nextStep", "dependencyUpdate", "confirmationEvidence", "summary", "body", "notes"]) {
    if (Object.hasOwn(body, name)) result[name] = text(body[name], name);
  }
  if (action === "patch") {
    if (body.title !== undefined) result.title = text(body.title, "title", 10, 150);
    if (body.description !== undefined) result.description = text(body.description, "description", 20, 5000);
    if (!result.title && !result.description) invalid("At least one descriptive field is required.");
  }
  if (action === "triage") {
    result.category = text(body.category, "category", 1, 80);
    result.impact = choice(body.impact, TICKET_URGENCIES, "impact");
    if (body.urgency !== undefined) result.urgency = choice(body.urgency, TICKET_URGENCIES, "urgency");
    if (body.priority !== undefined) result.priority = choice(body.priority, TICKET_PRIORITIES, "priority");
  }
  if (action === "assignment") result.assigneeId = objectId(body.assigneeId, "assigneeId", true);
  if (action === "wait") result.status = choice(body.status, ["WAITING_REQUESTER", "WAITING_VENDOR"], "status");
  if (action === "reopen") {
    if (body.sameIssue !== undefined && typeof body.sameIssue !== "boolean") invalid("sameIssue must be a boolean.");
    result.sameIssue = body.sameIssue === true;
  }
  if (action === "resolve") result.resolutionCode = choice(body.resolutionCode, RESOLUTION_CODES, "resolutionCode");
  if (action === "comment") result.visibility = choice(body.visibility ?? "PUBLIC", ["PUBLIC", "INTERNAL"], "visibility");
  if (action === "worklog") {
    result.start = date(body.start, "start");
    result.end = date(body.end, "end");
    if (result.end <= result.start) invalid("Worklog end must be later than start.");
  }
  const required = {
    assignment: ["reason"],
    wait: ["reason", "nextStep"],
    cancel: ["reason"],
    reopen: ["reason"],
    resolve: ["summary"],
    comment: ["body"],
    worklog: ["notes"]
  }[action] || [];
  for (const name of required) if (!result[name]) invalid(`${name} is required.`);
  return result;
}
