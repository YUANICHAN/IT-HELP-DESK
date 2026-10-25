import { AppError } from "../../shared/errors/app-error.js";
import { hasDepartmentCapability } from "../access/scopeFilters.js";

function capabilityScope(authentication, capability) {
  const grants = (authentication.permissions || []).filter(
    (grant) => grant.capability === capability,
  );
  return {
    organizationWide: grants.some((grant) => grant.scope.type === "ORGANIZATION"),
    departmentIds: [
      ...new Set(
        grants
          .filter((grant) => grant.scope.type === "DEPARTMENT")
          .map((grant) => grant.scope.departmentId),
      ),
    ],
  };
}

function departmentCondition(scope) {
  if (scope.organizationWide) return {};
  if (scope.departmentIds.length === 0) return null;
  return { requesterDepartment: { $in: scope.departmentIds } };
}

export function buildTicketAccessFilter(authentication) {
  const organization = authentication.user.organizationId;
  const user = authentication.user.id;
  const clauses = [{ requester: user }];

  const supportCondition = departmentCondition(
    capabilityScope(authentication, "support"),
  );
  if (supportCondition) {
    clauses.push({
      ...supportCondition,
      $or: [
        { assignee: user },
        {
          assignee: null,
          status: { $in: ["NEW", "OPEN"] },
          approvalStatus: { $in: ["NOT_REQUIRED", "APPROVED"] },
        },
      ],
    });
  }

  for (const capability of ["department_supervise", "ticket_triage"]) {
    const condition = departmentCondition(capabilityScope(authentication, capability));
    if (condition) clauses.push(condition);
  }

  return { organization, $or: clauses };
}

export function buildQueueAccessFilter(authentication) {
  const supportCondition = departmentCondition(
    capabilityScope(authentication, "support"),
  );

  if (!supportCondition || authentication.user.role !== "TECHNICIAN") {
    return {
      organization: authentication.user.organizationId,
      _id: { $exists: false },
    };
  }

  return {
    organization: authentication.user.organizationId,
    ...supportCondition,
    assignee: null,
    status: { $in: ["NEW", "OPEN"] },
    approvalStatus: { $in: ["NOT_REQUIRED", "APPROVED"] },
  };
}

export function canUseSupportScope(authentication, departmentId) {
  return (
    authentication.user.role === "TECHNICIAN" &&
    hasDepartmentCapability(authentication, "support", departmentId)
  );
}

export function viewerKind(authentication, ticket) {
  if (canViewInternal(authentication, ticket)) return "STAFF";
  const requesterId = ticket.requester?._id || ticket.requester;
  if (requesterId?.toString() === authentication.user.id) return "REQUESTER";

  const departmentId = ticket.requesterDepartment?._id || ticket.requesterDepartment;
  if (hasDepartmentCapability(authentication, "department_supervise", departmentId)) {
    return "SUPERVISOR_PUBLIC";
  }
  throw new AppError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
}

export function canTriage(authentication, ticket) {
  return authentication.user.role === "SUPERVISOR" && hasDepartmentCapability(authentication, "ticket_triage", ticket.requesterDepartment?._id || ticket.requesterDepartment);
}

export function canViewInternal(authentication, ticket) {
  const department = ticket.requesterDepartment?._id || ticket.requesterDepartment;
  const assignee = (ticket.assignee?._id || ticket.assignee)?.toString();
  return canTriage(authentication, ticket) || (canUseSupportScope(authentication, department) && (assignee === authentication.user.id || (!assignee && ["NEW", "OPEN"].includes(ticket.status) && ["NOT_REQUIRED", "APPROVED"].includes(ticket.approvalStatus))));
}

export function isAssignedTechnician(authentication, ticket) {
  return canUseSupportScope(authentication, ticket.requesterDepartment?._id || ticket.requesterDepartment) && (ticket.assignee?._id || ticket.assignee)?.toString() === authentication.user.id;
}

export const TERMINAL_STATUSES = Object.freeze(["CLOSED", "REJECTED", "CANCELLED"]);
export const ACTIVE_STATUSES = Object.freeze(["NEW", "OPEN", "IN_PROGRESS", "WAITING_REQUESTER", "WAITING_VENDOR"]);
export const PRIORITY_MATRIX = Object.freeze({ HIGH: { HIGH: "P1", MEDIUM: "P2", LOW: "P3" }, MEDIUM: { HIGH: "P2", MEDIUM: "P3", LOW: "P4" }, LOW: { HIGH: "P3", MEDIUM: "P4", LOW: "P4" } });
