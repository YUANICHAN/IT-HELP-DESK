import { AppError } from "../../shared/errors/app-error.js";

function matchingGrants(authentication, capability) {
  return (authentication?.permissions || []).filter(
    (grant) => grant.capability === capability,
  );
}

export function hasOrganizationCapability(authentication, capability) {
  return matchingGrants(authentication, capability).some(
    (grant) => grant.scope.type === "ORGANIZATION",
  );
}

export function hasDepartmentCapability(
  authentication,
  capability,
  departmentId,
) {
  if (!departmentId) return hasOrganizationCapability(authentication, capability);

  const normalizedDepartmentId = departmentId.toString();

  return matchingGrants(authentication, capability).some(
    (grant) =>
      grant.scope.type === "ORGANIZATION" ||
      (grant.scope.type === "DEPARTMENT" &&
        grant.scope.departmentId === normalizedDepartmentId),
  );
}

export function requireCapability(capability, resolveDepartmentId) {
  return function authorizeCapability(req, _res, next) {
    const departmentId = resolveDepartmentId?.(req) ?? null;
    const authorized = departmentId
      ? hasDepartmentCapability(req.auth, capability, departmentId)
      : hasOrganizationCapability(req.auth, capability);

    if (!authorized) {
      return next(
        new AppError(
          403,
          "CAPABILITY_REQUIRED",
          "An active access grant is required for this operation.",
        ),
      );
    }

    return next();
  };
}

export function buildCapabilityScopeFilter(
  authentication,
  capability,
  {
    organizationField = "organization",
    departmentField = "department",
  } = {},
) {
  const organizationId = authentication.user.organizationId;
  const grants = matchingGrants(authentication, capability);

  if (grants.some((grant) => grant.scope.type === "ORGANIZATION")) {
    return { [organizationField]: organizationId };
  }

  const departmentIds = [
    ...new Set(
      grants
        .filter((grant) => grant.scope.type === "DEPARTMENT")
        .map((grant) => grant.scope.departmentId),
    ),
  ];

  if (departmentIds.length === 0) {
    return {
      [organizationField]: organizationId,
      _id: { $exists: false },
    };
  }

  return {
    [organizationField]: organizationId,
    [departmentField]: { $in: departmentIds },
  };
}

export function buildSupportScopeFilter(authentication, fieldNames) {
  return buildCapabilityScopeFilter(authentication, "support", fieldNames);
}

export function ticketVisibilityPolicy(authentication, departmentId) {
  const support = hasDepartmentCapability(
    authentication,
    "support",
    departmentId,
  );
  const supervision = hasDepartmentCapability(
    authentication,
    "department_supervise",
    departmentId,
  );
  const triage = hasDepartmentCapability(
    authentication,
    "ticket_triage",
    departmentId,
  );

  return {
    canViewPublicInformation: support || supervision || triage,
    canViewInternalNotes: support || triage,
  };
}
