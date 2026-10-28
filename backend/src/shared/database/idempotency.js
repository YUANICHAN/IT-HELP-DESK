import { createHash } from "node:crypto";
import { AppError } from "../errors/app-error.js";
import { IdempotencyKey } from "./idempotencyKey.model.js";
import { env } from "../../config/env.js";

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/u;

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function requireIdempotencyKey(request) {
  const key = request.get("idempotency-key");
  if (!key || !KEY_PATTERN.test(key)) {
    throw new AppError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "Idempotency-Key must contain 8 to 128 letters, numbers, periods, underscores, colons, or hyphens.",
    );
  }
  return key;
}

export function requestDigest(input) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(input)))
    .digest("hex");
}

export async function findIdempotencyRecord({ organization, user, operation, key }) {
  return IdempotencyKey.findOne({ organization, user, operation, key }).lean();
}

export function assertIdempotencyInput(record, digest) {
  if (record && record.requestDigest !== digest) {
    throw new AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used with different input.",
    );
  }
}

export async function saveIdempotencyRecord(
  { organization, user, operation, key, digest, resourceId, responseStatus, resourceType = "TICKET" },
  mongoSession,
) {
  await IdempotencyKey.create(
    [
      {
        organization,
        user,
        operation,
        key,
        requestDigest: digest,
        resourceType,
        resourceId,
        responseStatus,
        expiresAt: new Date(
          Date.now() + env.worker.idempotencyRetentionHours * 3_600_000,
        ),
      },
    ],
    { session: mongoSession },
  );
}
