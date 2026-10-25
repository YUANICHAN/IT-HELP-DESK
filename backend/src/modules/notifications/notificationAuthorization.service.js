import { AccessGrant, CAPABILITY_RULES } from "../access/accessGrant.model.js";
import { Approval } from "../approvals/approval.model.js";
import { isNamedApprover } from "../approvals/approval.policy.js";
import { Asset } from "../assets/asset.model.js";
import { AssetAssignment } from "../assets/assetAssignment.model.js";
import { assetAccessFilter, canManageAssets } from "../assets/asset.policy.js";
import { Organization } from "../organization/organization.model.js";
import { Ticket } from "../tickets/ticket.model.js";
import {
  buildTicketAccessFilter,
  canViewInternal,
} from "../tickets/ticket.policy.js";
import { User } from "../users/user.model.js";
import { idOf } from "../../shared/validation/commands.js";

async function authorizationForRecipient(record, session = null) {
  const user = await User.findOne({
    _id: record.recipient,
    organization: record.organization,
    accountStatus: "ACTIVE",
  }).session(session).lean();
  if (!user) return null;
  const organization = await Organization.exists({
    _id: record.organization,
    isActive: true,
  }).session(session);
  if (!organization) return null;
  const grants = await AccessGrant.find({
    organization: record.organization,
    user: user._id,
    isActive: true,
    revokedAt: { $exists: false },
  }).session(session).lean();
  return {
    user: {
      id: user._id.toString(),
      organizationId: user.organization.toString(),
      departmentId: user.department.toString(),
      role: user.role,
    },
    permissions: grants
      .filter((grant) => CAPABILITY_RULES[grant.capability]?.roles.includes(user.role))
      .map((grant) => ({
        capability: grant.capability,
        scope: grant.department
          ? { type: "DEPARTMENT", departmentId: grant.department.toString() }
          : { type: "ORGANIZATION" },
      })),
  };
}

async function ticketAuthorization(record, auth, session) {
  if (record.accessKind === "TICKET_PUBLIC") {
    const ticket = await Ticket.findOne({
      $and: [{ _id: record.aggregateId }, buildTicketAccessFilter(auth)],
    }).session(session);
    return ticket ? { allowed: true, resource: ticket } : { allowed: false, reason: "TICKET_ACCESS_REVOKED" };
  }
  const ticket = await Ticket.findOne({
    _id: record.aggregateId,
    organization: record.organization,
  }).session(session);
  if (!ticket) return { allowed: false, reason: "RESOURCE_NOT_FOUND" };
  if (record.accessKind === "TICKET_INTERNAL") {
    return canViewInternal(auth, ticket)
      ? { allowed: true, resource: ticket }
      : { allowed: false, reason: "TICKET_ACCESS_REVOKED" };
  }
  if (record.accessKind === "TICKET_APPROVER") {
    const approval = record.metadata?.approvalId && (await Approval.findOne({
      _id: record.metadata.approvalId,
      organization: record.organization,
      ticket: ticket._id,
    }).session(session));
    return approval && isNamedApprover(auth, ticket, approval)
      ? { allowed: true, resource: ticket }
      : { allowed: false, reason: "APPROVAL_ACCESS_REVOKED" };
  }
  return { allowed: false, reason: "ACCESS_KIND_UNSUPPORTED" };
}

async function assetAuthorization(record, auth, session) {
  const asset = await Asset.findOne({
    _id: record.aggregateId,
    organization: record.organization,
  }).session(session);
  if (!asset) return { allowed: false, reason: "RESOURCE_NOT_FOUND" };
  if (record.accessKind === "ASSET_MANAGER") {
    return canManageAssets(auth, asset.department)
      ? { allowed: true, resource: asset, linkAllowed: true }
      : { allowed: false, reason: "ASSET_ACCESS_REVOKED" };
  }
  if (record.accessKind === "ASSET_CUSTODIAN") {
    const assignment = record.metadata?.assignmentId && (await AssetAssignment.findOne({
      _id: record.metadata.assignmentId,
      organization: record.organization,
      asset: asset._id,
      custodian: record.recipient,
    }).session(session).lean());
    if (!assignment || idOf(record.metadata?.custodianId) !== idOf(record.recipient)) {
      return { allowed: false, reason: "ASSET_CUSTODY_MISMATCH" };
    }
    const linked = await Asset.findOne({
      $and: [{ _id: asset._id }, await assetAccessFilter(auth, session)],
    }).session(session).select("_id").lean();
    return { allowed: true, resource: asset, linkAllowed: Boolean(linked) };
  }
  return { allowed: false, reason: "ACCESS_KIND_UNSUPPORTED" };
}

export async function authorizeNotificationRecord(record, session = null) {
  const auth = await authorizationForRecipient(record, session);
  if (!auth) return { allowed: false, reason: "RECIPIENT_INACTIVE" };
  if (record.aggregateType === "TICKET") {
    const result = await ticketAuthorization(record, auth, session);
    return { ...result, auth, linkAllowed: result.allowed };
  }
  if (record.aggregateType === "ASSET") {
    const result = await assetAuthorization(record, auth, session);
    return { ...result, auth };
  }
  return { allowed: false, reason: "AGGREGATE_UNSUPPORTED", auth };
}

const TITLES = Object.freeze({
  TICKET_CREATED: "Ticket submitted",
  TICKET_APPROVAL_REQUESTED: "Ticket approval requested",
  TICKET_APPROVAL_REROUTED: "Ticket approval reassigned",
  TICKET_APPROVAL_APPROVED: "Ticket approved",
  TICKET_APPROVAL_REJECTED: "Ticket rejected",
  TICKET_APPROVAL_SUPERSEDED: "Ticket approval superseded",
  TICKET_CLAIMED: "Ticket claimed",
  TICKET_ASSIGNED: "Ticket assignment changed",
  TICKET_PUBLIC_REPLY_ADDED: "New public ticket reply",
  TICKET_INTERNAL_NOTE_ADDED: "New internal ticket note",
  TICKET_WAITING: "Ticket waiting status changed",
  TICKET_RESOLVED: "Ticket resolved",
  TICKET_CLOSED: "Ticket closed",
  TICKET_CANCELLED: "Ticket cancelled",
  TICKET_SLA_RESPONSE_BREACHED: "Ticket response target breached",
  TICKET_SLA_RESOLUTION_BREACHED: "Ticket resolution target breached",
  ASSET_ASSIGNED: "Equipment assigned",
  ASSET_RETURNED: "Equipment returned",
  ASSET_CREATED: "Equipment record created",
  ASSET_UPDATED: "Equipment record updated",
  ASSET_STATE_CHANGED: "Equipment status changed",
});

export function notificationPresentation(record, authorization) {
  const title = TITLES[record.eventType] ||
    (record.aggregateType === "TICKET" ? "Ticket updated" : "Equipment updated");
  const linkPath = authorization.linkAllowed
    ? `/api/v1/${record.aggregateType === "TICKET" ? "tickets" : "assets"}/${idOf(record.aggregateId)}`
    : undefined;
  return { title, linkPath };
}
