import { AppError } from "../../shared/errors/app-error.js";

export function validateNotificationQuery(query) {
  const allowed = new Set(["page", "limit", "state"]);
  if (Object.keys(query).some((key) => !allowed.has(key))) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "The notification query contains unsupported fields.",
    );
  }
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 25);
  const state = query.state || "all";
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) {
    throw new AppError(400, "VALIDATION_ERROR", "Page must be a positive integer.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError(400, "VALIDATION_ERROR", "Limit must be between 1 and 100.");
  }
  if (!["all", "read", "unread"].includes(state)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Notification state must be all, read, or unread.",
    );
  }
  return { page, limit, state };
}
