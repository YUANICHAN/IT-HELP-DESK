import { Approval } from "./approval.model.js";
import { User } from "../users/user.model.js";
import { AccessGrant } from "../access/accessGrant.model.js";
import { Department } from "../organization/department.model.js";
import { Organization } from "../organization/organization.model.js";
import { hasDepartmentCapability } from "../access/scopeFilters.js";
import { AppError } from "../../shared/errors/app-error.js";
import { same } from "../../shared/validation/commands.js";
export function approvalNotFound() {
  return new AppError(404, "APPROVAL_NOT_FOUND", "Approval was not found.");
}
export function approvalConflict() {
  throw new AppError(409, "APPROVAL_CONFLICT", "The approval or ticket changed. Refresh it and retry.");
}
export function hasApprovalScope(auth, ticket) {
  return auth.user.role === "SUPERVISOR" && same(auth.user.organizationId, ticket.organization) && ["department_supervise", "ticket_triage"].some(capability => hasDepartmentCapability(auth, capability, ticket.requesterDepartment));
}
export function isNamedApprover(auth, ticket, approval) {
  return hasApprovalScope(auth, ticket) && same(auth.user.id, approval.approver) && !same(auth.user.id, ticket.requester);
}
export async function eligibleApprover(ticket, userId, session = null) {
  if (!userId || same(ticket.requester, userId)) return false;
  const user = await User.exists({
    _id: userId,
    organization: ticket.organization,
    role: "SUPERVISOR",
    accountStatus: "ACTIVE"
  }).session(session);
  return Boolean(user && (await AccessGrant.exists({
    organization: ticket.organization,
    user: userId,
    capability: {
      $in: ["department_supervise", "ticket_triage"]
    },
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
export async function configuredApprover(actor, service, session = null) {
  if (!service.requiresApproval) return null;
  if (service.ticketType !== "REQUEST") throw new AppError(409, "APPROVAL_CONFIGURATION_INVALID", "Incidents cannot require approval.");
  const ticket = {
    organization: actor.organization,
    requester: actor._id,
    requesterDepartment: actor.department
  };
  const department = await Department.findOne({
    _id: actor.department,
    organization: actor.organization,
    isActive: true
  }).session(session);
  const organization = await Organization.findById(actor.organization).session(session);
  if (department && (await eligibleApprover(ticket, department.designatedApprover, session))) return department.designatedApprover;
  if (department && (await eligibleApprover(ticket, organization?.backupApprover, session))) return organization.backupApprover;
  throw new AppError(409, "APPROVER_CONFIGURATION_REQUIRED", "No eligible configured approver is available. Ask your administrator to configure the department approver or organization backup, then retry.");
}
export function requirePendingRound(ticket, approval) {
  if (!approval || !ticket.approvalRequired || ticket.type !== "REQUEST" || ticket.status !== "WAITING_APPROVAL" || ticket.approvalStatus !== "PENDING" || ticket.currentApprovalRound !== approval.round || approval.status !== "PENDING") approvalConflict();
}

// All fulfillment paths use the frozen requirement and the persisted current round.
// Catalog edits and an approvalStatus flag alone cannot authorize fulfillment.
export async function requireFulfillmentApproval(ticket, session) {
  if (["WAITING_APPROVAL", "REJECTED", "CANCELLED"].includes(ticket.status)) approvalConflict();
  const required = ticket.approvalRequired || ticket.configurationSnapshots?.service?.requiresApproval;
  if (!required) {
    if (ticket.approvalStatus !== "NOT_REQUIRED") approvalConflict();
    return;
  }
  if (ticket.type !== "REQUEST" || ticket.approvalStatus !== "APPROVED" || !ticket.currentApprovalRound) approvalConflict();
  const approval = await Approval.findOne({
    organization: ticket.organization,
    ticket: ticket._id,
    round: ticket.currentApprovalRound,
    status: "APPROVED"
  }).session(session);
  if (!approval || same(approval.approver, ticket.requester)) approvalConflict();
}
