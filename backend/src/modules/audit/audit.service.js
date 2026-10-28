import mongoose from "mongoose";
import { currentAccess } from "../access/currentAccess.service.js";
import { AccessGrant } from "../access/accessGrant.model.js";
import { AuthenticationAudit } from "../auth/authenticationAudit.model.js";
import { Department } from "../organization/department.model.js";
import { User } from "../users/user.model.js";
import { AUDIT_EXPLORER_ACTIONS } from "./audit.validation.js";

const AUTHENTICATION_ACTIONS = Object.freeze([
  "LOGIN", "LOGOUT", "SESSION_REVOKED", "PASSWORD_CHANGED", "AUTHENTICATION_REJECTED",
]);
const ACCESS_ACTIONS = Object.freeze(["ACCESS_GRANT_CREATED", "ACCESS_GRANT_REVOKED"]);

function sourceFor(action) {
  return ACCESS_ACTIONS.includes(action) ? "ACCESS_ADMINISTRATION" : "AUTHENTICATION";
}

function entityCondition(type) {
  if (type === "USER") return { $or: [{ user: { $exists: true } }, { targetUser: { $exists: true } }] };
  if (type === "SESSION") return { session: { $exists: true } };
  if (type === "ACCESS_GRANT") return { accessGrant: { $exists: true } };
  if (type === "DEPARTMENT") return { department: { $type: "objectId" } };
  return null;
}

function auditFilter(organizationId, filters) {
  const filter = {
    organization: organizationId,
    eventType: { $in: AUDIT_EXPLORER_ACTIONS },
  };
  if (filters.action) filter.eventType = filters.action;
  if (filters.actorId) filter.user = filters.actorId;
  if (filters.source) {
    if (filters.action) {
      if (sourceFor(filters.action) !== filters.source) filter.eventType = { $in: [] };
    } else {
      filter.eventType = {
        $in: filters.source === "AUTHENTICATION" ? AUTHENTICATION_ACTIONS : ACCESS_ACTIONS,
      };
    }
  }
  if (filters.from || filters.to) {
    filter.occurredAt = {};
    if (filters.from) filter.occurredAt.$gte = filters.from;
    if (filters.to) filter.occurredAt.$lt = filters.to;
  }
  const entity = entityCondition(filters.entityType);
  return entity ? { $and: [filter, entity] } : filter;
}

function safeActor(row, users) {
  const user = row.user ? users.get(row.user.toString()) : null;
  return user ? { id: user._id.toString(), displayName: user.displayName } : null;
}

function safeEntity(row, users, grants, departments, preferredType) {
  if (preferredType === "SESSION" && row.session) {
    return { type: "SESSION", id: row.session.toString() };
  }
  if (preferredType === "DEPARTMENT" && row.department) {
    return {
      type: "DEPARTMENT",
      id: row.department.toString(),
      name: departments.get(row.department.toString())?.name || null,
    };
  }
  if (preferredType === "USER") {
    const preferredUserId = row.targetUser || row.user;
    if (preferredUserId) {
      const preferredUser = users.get(preferredUserId.toString());
      return {
        type: "USER",
        id: preferredUserId.toString(),
        displayName: preferredUser?.displayName || null,
      };
    }
  }
  if (row.accessGrant) {
    const grant = grants.get(row.accessGrant.toString());
    return {
      type: "ACCESS_GRANT",
      id: row.accessGrant.toString(),
      capability: grant?.capability || row.capability || null,
      scope: (grant?.department || row.department)
        ? {
            type: "DEPARTMENT",
            departmentId: (grant?.department || row.department).toString(),
            departmentName: departments.get((grant?.department || row.department).toString())?.name || null,
          }
        : { type: "ORGANIZATION" },
    };
  }
  const targetId = row.targetUser || row.user;
  if (targetId) {
    const target = users.get(targetId.toString());
    return {
      type: "USER",
      id: targetId.toString(),
      displayName: target?.displayName || null,
    };
  }
  if (row.department) {
    return {
      type: "DEPARTMENT",
      id: row.department.toString(),
      name: departments.get(row.department.toString())?.name || null,
    };
  }
  if (row.session) return { type: "SESSION", id: row.session.toString() };
  return null;
}

export async function exploreAudit(authentication, filters) {
  const auth = await currentAccess(authentication);
  const filter = auditFilter(auth.user.organizationId, filters);
  const direction = filters.sort === "asc" ? 1 : -1;
  const [rows, total] = await Promise.all([
    AuthenticationAudit.find(filter)
      .sort({ occurredAt: direction, _id: direction })
      .skip((filters.page - 1) * filters.limit)
      .limit(filters.limit)
      .lean(),
    AuthenticationAudit.countDocuments(filter),
  ]);
  const userIds = new Set();
  const grantIds = new Set();
  const departmentIds = new Set();
  for (const row of rows) {
    if (row.user) userIds.add(row.user.toString());
    if (row.targetUser) userIds.add(row.targetUser.toString());
    if (row.accessGrant) grantIds.add(row.accessGrant.toString());
    if (row.department) departmentIds.add(row.department.toString());
  }
  const orgId = new mongoose.Types.ObjectId(auth.user.organizationId);
  const [users, grants] = await Promise.all([
    User.find({ _id: { $in: [...userIds] }, organization: orgId }).select("displayName").lean(),
    AccessGrant.find({ _id: { $in: [...grantIds] }, organization: orgId })
      .select("capability department").lean(),
  ]);
  for (const grant of grants) if (grant.department) departmentIds.add(grant.department.toString());
  const departments = await Department.find({
    _id: { $in: [...departmentIds] }, organization: orgId,
  }).select("name").lean();
  const userMap = new Map(users.map((row) => [row._id.toString(), row]));
  const grantMap = new Map(grants.map((row) => [row._id.toString(), row]));
  const departmentMap = new Map(departments.map((row) => [row._id.toString(), row]));
  return {
    events: rows.map((row) => ({
      id: row._id.toString(),
      action: row.eventType,
      source: sourceFor(row.eventType),
      outcome: row.outcome,
      reasonCode: row.reasonCode || null,
      actor: safeActor(row, userMap),
      entity: safeEntity(row, userMap, grantMap, departmentMap, filters.entityType),
      occurredAt: row.occurredAt.toISOString(),
      metadata: {
        ...(row.capability ? { capability: row.capability } : {}),
        ...(row.client?.deviceType ? { deviceType: row.client.deviceType } : {}),
      },
    })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.ceil(total / filters.limit),
    },
    ordering: `occurredAt:${filters.sort},_id:${filters.sort}`,
  };
}
