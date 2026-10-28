import mongoose from "mongoose";
import { AppError } from "../../shared/errors/app-error.js";
import { Department } from "../organization/department.model.js";
import { hasDepartmentCapability } from "../access/scopeFilters.js";

export function aggregateSafeFilter(value) {
  if (Array.isArray(value)) return value.map(aggregateSafeFilter);
  if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof mongoose.Types.ObjectId)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, aggregateSafeFilter(nested)]),
    );
  }
  if (typeof value === "string" && mongoose.isObjectIdOrHexString(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return value;
}

export async function authorizeDepartmentFilter(auth, departmentId) {
  if (!departmentId) return null;
  const ownDepartment = auth.user.departmentId === departmentId;
  const scoped = ["support", "department_supervise", "ticket_triage", "asset_manage"]
    .some((capability) => hasDepartmentCapability(auth, capability, departmentId));
  if (!ownDepartment && !scoped) {
    throw new AppError(
      403,
      "DEPARTMENT_FILTER_FORBIDDEN",
      "The requested department filter is outside your current scope.",
    );
  }
  const department = await Department.exists({
    _id: departmentId,
    organization: auth.user.organizationId,
  });
  if (!department) {
    throw new AppError(
      403,
      "DEPARTMENT_FILTER_FORBIDDEN",
      "The requested department filter is outside your current scope.",
    );
  }
  return new mongoose.Types.ObjectId(departmentId);
}

export function withDepartment(ticketFilter, departmentId) {
  return departmentId
    ? { $and: [ticketFilter, { requesterDepartment: departmentId }] }
    : ticketFilter;
}

export function capabilityDepartmentIds(auth, capability) {
  const grants = (auth.permissions || []).filter((grant) => grant.capability === capability);
  return {
    organizationWide: grants.some((grant) => grant.scope.type === "ORGANIZATION"),
    departmentIds: grants
      .filter((grant) => grant.scope.type === "DEPARTMENT")
      .map((grant) => new mongoose.Types.ObjectId(grant.scope.departmentId)),
  };
}
