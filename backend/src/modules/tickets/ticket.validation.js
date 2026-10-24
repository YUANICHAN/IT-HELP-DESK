import { AppError } from "../../shared/errors/app-error.js";
import { requireExactObject } from "../../shared/http/request-validation.js";
import {
  RESOLUTION_CODES,
  TICKET_STATUSES,
  TICKET_URGENCIES,
} from "./ticket.model.js";
import { TICKET_TYPES } from "../catalog/serviceItem.model.js";
import { objectId, invalid } from "../../shared/validation/commands.js";

function text(value, label, minimum, maximum) {
  if (typeof value !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", `${label} must be a string.`);
  }
  const normalized = value.trim();
  const length = [...normalized].length;
  if (length < minimum || length > maximum) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${label} must contain ${minimum} to ${maximum} characters.`,
    );
  }
  return normalized;
}

function oneOf(value, values, label) {
  if (!values.includes(value)) {
    throw new AppError(400, "VALIDATION_ERROR", `${label} is not supported.`);
  }
  return value;
}

export function validateCreateTicket(body) {
  requireExactObject(
    body,
    ["serviceItemId", "title", "description", "urgency", "locationId", "assetIds", "primaryAssetId", "followUpOfId"],
    ["serviceItemId", "title", "description", "urgency"],
  );
  if (body.assetIds !== undefined && (!Array.isArray(body.assetIds) || body.assetIds.length > 20)) invalid("assetIds must contain at most twenty IDs.");
  const assetIds = [...new Set((body.assetIds || []).map(id => objectId(id, "assetId")))];
  const primaryAssetId = body.primaryAssetId != null ? objectId(body.primaryAssetId, "primaryAssetId") : null;
  if (primaryAssetId && !assetIds.includes(primaryAssetId)) invalid("primaryAssetId must be in assetIds.");
  if (typeof body.serviceItemId !== "string" || !body.serviceItemId) {
    throw new AppError(400, "VALIDATION_ERROR", "Service item ID is required.");
  }
  if (
    Object.hasOwn(body, "locationId") &&
    body.locationId !== null &&
    (typeof body.locationId !== "string" || !body.locationId)
  ) {
    throw new AppError(400, "VALIDATION_ERROR", "Location ID must be a string or null.");
  }
  return {
    serviceItemId: body.serviceItemId,
    title: text(body.title, "Title", 10, 150),
    description: text(body.description, "Description", 20, 5000),
    urgency: oneOf(body.urgency, TICKET_URGENCIES, "Urgency"),
    locationId: body.locationId || null,
    assetIds,
    primaryAssetId,
    followUpOfId: body.followUpOfId != null ? objectId(body.followUpOfId, "followUpOfId") : null,
  };
}

export function validateExpectedVersion(body) {
  requireExactObject(body, ["expectedVersion"], ["expectedVersion"]);
  if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) {
    throw new AppError(400, "VALIDATION_ERROR", "expectedVersion must be a non-negative integer.");
  }
  return body.expectedVersion;
}

export function validateResolution(body) {
  requireExactObject(
    body,
    ["expectedVersion", "summary", "resolutionCode"],
    ["expectedVersion", "summary", "resolutionCode"],
  );
  return {
    expectedVersion: validateExpectedVersion({ expectedVersion: body.expectedVersion }),
    summary: text(body.summary, "Resolution summary", 1, 5000),
    resolutionCode: oneOf(body.resolutionCode, RESOLUTION_CODES, "Resolution code"),
  };
}

export function validateComment(body) {
  requireExactObject(body, ["body"], ["body"]);
  return { body: text(body.body, "Comment body", 1, 5000) };
}

function singleQueryValue(value, name) {
  if (Array.isArray(value) || (value != null && typeof value !== "string")) {
    throw new AppError(400, "VALIDATION_ERROR", `${name} must be supplied once.`);
  }
  return value;
}

function positiveInteger(value, fallback, maximum, name) {
  if (value == null) return fallback;
  const raw = singleQueryValue(value, name);
  if (!/^\d+$/u.test(raw)) {
    throw new AppError(400, "VALIDATION_ERROR", `${name} must be a positive integer.`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new AppError(400, "VALIDATION_ERROR", `${name} is outside the allowed range.`);
  }
  return parsed;
}

function dateValue(value, name) {
  if (value == null) return null;
  const raw = singleQueryValue(value, name);
  const date = new Date(raw);
  if (!raw || Number.isNaN(date.getTime())) {
    throw new AppError(400, "VALIDATION_ERROR", `${name} must be a valid date.`);
  }
  return date;
}

export function validateTicketQuery(query) {
  const allowed = ["status", "type", "from", "to", "search", "page", "limit", "sort"];
  const unexpected = Object.keys(query).filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    throw new AppError(400, "VALIDATION_ERROR", "The query contains unsupported fields.");
  }

  const status = singleQueryValue(query.status, "status");
  const type = singleQueryValue(query.type, "type");
  if (status != null) oneOf(status, TICKET_STATUSES, "Status");
  if (type != null) oneOf(type, TICKET_TYPES, "Type");

  const from = dateValue(query.from, "from");
  const to = dateValue(query.to, "to");
  if (from && to && from > to) {
    throw new AppError(400, "VALIDATION_ERROR", "from must not be later than to.");
  }

  let search = singleQueryValue(query.search, "search");
  if (search != null) search = text(search, "Search", 2, 100);

  const sort = singleQueryValue(query.sort, "sort") || "-submittedAt";
  const sorts = {
    submittedAt: { submittedAt: 1, _id: 1 },
    "-submittedAt": { submittedAt: -1, _id: -1 },
    updatedAt: { updatedAt: 1, _id: 1 },
    "-updatedAt": { updatedAt: -1, _id: -1 },
    reference: { reference: 1, _id: 1 },
    "-reference": { reference: -1, _id: -1 },
    priority: { priority: 1, _id: 1 },
    "-priority": { priority: -1, _id: -1 },
  };
  if (!sorts[sort]) {
    throw new AppError(400, "VALIDATION_ERROR", "Sort is not supported.");
  }

  return {
    status,
    type,
    from,
    to,
    search,
    page: positiveInteger(query.page, 1, 1_000_000, "page"),
    limit: positiveInteger(query.limit, 25, 100, "limit"),
    sort: sorts[sort],
  };
}

export function validateTimelineQuery(query) {
  const unexpected = Object.keys(query).filter(
    (key) => !["page", "limit"].includes(key),
  );
  if (unexpected.length) {
    throw new AppError(400, "VALIDATION_ERROR", "The query contains unsupported fields.");
  }
  return {
    page: positiveInteger(query.page, 1, 1_000_000, "page"),
    limit: positiveInteger(query.limit, 25, 100, "limit"),
  };
}
