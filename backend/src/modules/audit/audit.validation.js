import mongoose from "mongoose";
import { AppError } from "../../shared/errors/app-error.js";

const ACTIONS = Object.freeze([
  "LOGIN",
  "LOGOUT",
  "SESSION_REVOKED",
  "PASSWORD_CHANGED",
  "AUTHENTICATION_REJECTED",
  "ACCESS_GRANT_CREATED",
  "ACCESS_GRANT_REVOKED",
]);
const SOURCES = Object.freeze(["AUTHENTICATION", "ACCESS_ADMINISTRATION"]);
const ENTITY_TYPES = Object.freeze(["USER", "SESSION", "ACCESS_GRANT", "DEPARTMENT"]);

function validationError(message) {
  return new AppError(400, "VALIDATION_ERROR", message);
}

function optionalScalar(query, name) {
  const value = query[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw validationError(`${name} must be a single non-empty string.`);
  }
  return value;
}

function timestamp(value, name) {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    throw validationError(`${name} must be an RFC 3339 timestamp with an explicit offset.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw validationError(`${name} is invalid.`);
  return parsed;
}

export function validateAuditQuery(query) {
  const allowed = new Set([
    "from", "to", "action", "actorId", "entityType", "source", "page", "limit", "sort",
  ]);
  if (Object.keys(query).some((key) => !allowed.has(key))) {
    throw validationError("The audit query contains unsupported fields.");
  }
  const from = timestamp(optionalScalar(query, "from"), "from");
  const to = timestamp(optionalScalar(query, "to"), "to");
  if (from && to && from >= to) {
    throw validationError("from must be earlier than to; the end boundary is exclusive.");
  }
  if (from && to && to - from > 366 * 86_400_000) {
    throw validationError("The audit date range cannot exceed 366 days.");
  }
  const action = optionalScalar(query, "action");
  const source = optionalScalar(query, "source");
  const entityType = optionalScalar(query, "entityType");
  const actorId = optionalScalar(query, "actorId");
  const sort = optionalScalar(query, "sort") || "desc";
  if (action && !ACTIONS.includes(action)) throw validationError("Audit action is not supported.");
  if (source && !SOURCES.includes(source)) throw validationError("Audit source is not supported.");
  if (entityType && !ENTITY_TYPES.includes(entityType)) throw validationError("Audit entity type is not supported.");
  if (actorId && !mongoose.isObjectIdOrHexString(actorId)) throw validationError("actorId is invalid.");
  if (!['asc', 'desc'].includes(sort)) throw validationError("sort must be asc or desc.");
  const pageRaw = optionalScalar(query, "page") || "1";
  const limitRaw = optionalScalar(query, "limit") || "25";
  if (!/^\d+$/u.test(pageRaw) || !/^\d+$/u.test(limitRaw)) {
    throw validationError("page and limit must be positive integers.");
  }
  const page = Number(pageRaw);
  const limit = Number(limitRaw);
  if (page < 1 || page > 1_000_000) throw validationError("page must be between 1 and 1000000.");
  if (limit < 1 || limit > 100) throw validationError("limit must be between 1 and 100.");
  return { from, to, action, actorId, entityType, source, page, limit, sort };
}

export const AUDIT_EXPLORER_ACTIONS = ACTIONS;
