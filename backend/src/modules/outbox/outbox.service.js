import { AccessGrant, CAPABILITY_RULES } from "../access/accessGrant.model.js";
import { User } from "../users/user.model.js";
import { clockNow } from "../../shared/time/clock.js";
import { idOf } from "../../shared/validation/commands.js";
import { OutboxEvent } from "./outboxEvent.model.js";

const SAFE_METADATA_FIELDS = new Set([
  "reference",
  "approvalId",
  "round",
  "metric",
  "cycleNumber",
  "assetTag",
  "assignmentId",
  "custodianId",
]);

function safeMetadata(input = {}) {
  const result = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!SAFE_METADATA_FIELDS.has(key) || raw == null) continue;
    if (Number.isSafeInteger(raw)) {
      result[key] = raw;
      continue;
    }
    const value = idOf(raw);
    if (typeof value === "string") result[key] = value.slice(0, 120);
  }
  return result;
}

async function capabilityRecipientIds({
  organization,
  capability,
  department,
  session,
}) {
  const grants = await AccessGrant.find({
    organization,
    capability,
    isActive: true,
    revokedAt: { $exists: false },
    ...(department
      ? { $or: [{ department }, { department: null }] }
      : { department: null }),
  }).select("user capability").session(session).lean();
  if (grants.length === 0) return [];
  const users = await User.find({
    _id: { $in: grants.map((grant) => grant.user) },
    organization,
    accountStatus: "ACTIVE",
  }).select("role").session(session).lean();
  const roles = CAPABILITY_RULES[capability]?.roles || [];
  return users.filter((user) => roles.includes(user.role)).map((user) => user._id);
}

function descriptorKey(descriptor) {
  return `${idOf(descriptor.userId)}:${descriptor.channel || "IN_APP"}`;
}

export async function enqueueOutboxEvent({
  organization,
  sourceEvent,
  eventType,
  aggregateType,
  aggregateId,
  directRecipients = [],
  capabilityRecipients = [],
  excludeUserIds = [],
  metadata = {},
  occurredAt = clockNow(),
}, session) {
  const descriptors = [...directRecipients];
  for (const target of capabilityRecipients) {
    const ids = await capabilityRecipientIds({
      organization,
      capability: target.capability,
      department: target.department,
      session,
    });
    descriptors.push(...ids.map((userId) => ({ ...target, userId })));
  }
  const excluded = new Set(excludeUserIds.filter(Boolean).map(idOf));
  const unique = new Map();
  for (const descriptor of descriptors) {
    const userId = idOf(descriptor.userId);
    if (!userId || excluded.has(userId)) continue;
    const channel = descriptor.channel || "IN_APP";
    const key = descriptorKey({ ...descriptor, userId, channel });
    if (!unique.has(key)) unique.set(key, { ...descriptor, userId, channel });
  }
  const sanitized = safeMetadata(metadata);
  const created = [];
  for (const descriptor of unique.values()) {
    const deduplicationKey = `${idOf(sourceEvent)}:${descriptor.userId}:${descriptor.channel}`;
    const existing = await OutboxEvent.findOne({
      organization,
      deduplicationKey,
    }).session(session).lean();
    if (existing) {
      created.push(existing);
      continue;
    }
    const [outbox] = await OutboxEvent.create([{
      organization,
      sourceEvent,
      deduplicationKey,
      eventType,
      aggregateType,
      aggregateId,
      recipient: descriptor.userId,
      channel: descriptor.channel,
      accessKind: descriptor.accessKind,
      visibility: descriptor.visibility,
      metadata: sanitized,
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: occurredAt,
    }], { session });
    created.push(outbox);
  }
  return created;
}

export { safeMetadata };
