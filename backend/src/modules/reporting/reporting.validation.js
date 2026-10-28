import mongoose from "mongoose";
import { AppError } from "../../shared/errors/app-error.js";

function single(value, name) {
  if (Array.isArray(value) || (value != null && typeof value !== "string")) {
    throw new AppError(400, "VALIDATION_ERROR", `${name} must be supplied once.`);
  }
  return value;
}

function instant(value, name) {
  if (value == null) return null;
  const raw = single(value, name);
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(raw) || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(raw)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${name} must be an RFC 3339 timestamp with an explicit offset.`,
    );
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, "VALIDATION_ERROR", `${name} is not a valid timestamp.`);
  }
  return parsed;
}

export function validateReportingQuery(query, asOf) {
  const allowed = new Set(["from", "to", "departmentId"]);
  if (Object.keys(query).some((key) => !allowed.has(key))) {
    throw new AppError(400, "VALIDATION_ERROR", "The reporting query contains unsupported fields.");
  }
  const to = instant(query.to, "to") || asOf;
  const from = instant(query.from, "from") || new Date(to.getTime() - 30 * 86_400_000);
  if (from >= to) {
    throw new AppError(400, "VALIDATION_ERROR", "from must be earlier than to.");
  }
  if (to - from > 366 * 86_400_000) {
    throw new AppError(400, "VALIDATION_ERROR", "The reporting range cannot exceed 366 days.");
  }
  const departmentId = single(query.departmentId, "departmentId") || null;
  if (departmentId && !mongoose.isObjectIdOrHexString(departmentId)) {
    throw new AppError(400, "VALIDATION_ERROR", "departmentId must be a valid identifier.");
  }
  return { from, to, departmentId };
}
