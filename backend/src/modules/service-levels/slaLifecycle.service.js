import { AppError } from "../../shared/errors/app-error.js";
import { ensureMetricBreach } from "./slaBreach.service.js";
import {
  newCycleClockFields,
  priorityChangeFields,
  responseCompletionFields,
  resolutionCompletionFields,
} from "./slaClock.service.js";
import { SlaCycle } from "./slaCycle.model.js";
import { SlaPause } from "./slaPause.model.js";

function conflict() {
  throw new AppError(409, "STALE_SLA_CLOCK", "The SLA clock changed. Refresh and retry.");
}

export function cycleCreationFields(snapshots, priority, startedAt) {
  return newCycleClockFields(snapshots, priority, startedAt);
}

export async function openResolutionPause(ticket, reason, at, actorId, session) {
  const cycle = await SlaCycle.findOne({
    organization: ticket.organization,
    ticket: ticket._id,
    cycleNumber: ticket.slaCycleNumber,
    endedAt: { $exists: false },
  }).session(session);
  if (!cycle) conflict();
  const overlapping = await SlaPause.exists({
    organization: ticket.organization,
    ticket: ticket._id,
    cycleNumber: ticket.slaCycleNumber,
    $or: [
      { endedAt: null },
      { endedAt: { $gt: at } },
    ],
  }).session(session);
  if (overlapping) conflict();
  await SlaPause.create([{
    organization: ticket.organization,
    ticket: ticket._id,
    cycleNumber: ticket.slaCycleNumber,
    clock: "RESOLUTION",
    reason,
    startedAt: at,
    startedBy: actorId,
    endedAt: null,
  }], { session });
  const updated = await SlaCycle.findOneAndUpdate(
    { _id: cycle._id, clockRevision: cycle.clockRevision },
    { $unset: { cachedResolutionDueAt: 1 }, $inc: { clockRevision: 1 } },
    { session, returnDocument: "after" },
  );
  if (!updated) conflict();
  const pauses = await SlaPause.find({
    organization: ticket.organization,
    ticket: ticket._id,
    cycleNumber: ticket.slaCycleNumber,
  }).session(session).lean();
  const breach = await ensureMetricBreach({
    ticket,
    cycle: updated,
    pauses,
    metric: "RESOLUTION",
    at,
    actorId,
    session,
  });
  if (breach) {
    await SlaCycle.updateOne(
      { _id: updated._id },
      { $set: { resolutionEvaluationComplete: true } },
      { session },
    );
  }
}

export async function closeResolutionPause(ticket, at, actorId, endReason, session) {
  const pauseUpdate = await SlaPause.updateOne(
    {
      organization: ticket.organization,
      ticket: ticket._id,
      cycleNumber: ticket.slaCycleNumber,
      endedAt: null,
      startedAt: { $lte: at },
    },
    { $set: { endedAt: at, endedBy: actorId, endReason } },
    { session, runValidators: true },
  );
  if (pauseUpdate.matchedCount === 0) {
    const openPause = await SlaPause.exists({
      organization: ticket.organization,
      ticket: ticket._id,
      cycleNumber: ticket.slaCycleNumber,
      endedAt: null,
    }).session(session);
    if (openPause) conflict();
    return false;
  }
  const cycle = await SlaCycle.findOne({
    organization: ticket.organization,
    ticket: ticket._id,
    cycleNumber: ticket.slaCycleNumber,
    endedAt: { $exists: false },
  }).session(session);
  if (!cycle) conflict();
  const pauses = await SlaPause.find({
    organization: ticket.organization,
    ticket: ticket._id,
    cycleNumber: ticket.slaCycleNumber,
  }).session(session).lean();
  const fields = priorityChangeFields(
    cycle,
    pauses,
    cycle.priority,
    actorId,
    "Resolution pause ended",
    at,
  );
  const updated = await SlaCycle.updateOne(
    { _id: cycle._id, clockRevision: cycle.clockRevision },
    {
      $set: { cachedResolutionDueAt: fields.cachedResolutionDueAt },
      $inc: { clockRevision: 1 },
    },
    { session },
  );
  if (updated.matchedCount !== 1) conflict();
  return true;
}

export async function completeFirstResponse(ticket, at, actorId, session) {
  const cycle = await SlaCycle.findOne({
    organization: ticket.organization,
    ticket: ticket._id,
    cycleNumber: ticket.slaCycleNumber,
    endedAt: { $exists: false },
  }).session(session);
  if (!cycle || cycle.firstResponseAt) return false;
  const fields = responseCompletionFields(cycle, at);
  const updated = await SlaCycle.findOneAndUpdate(
    { _id: cycle._id, clockRevision: cycle.clockRevision, firstResponseAt: { $exists: false } },
    { $set: fields, $inc: { clockRevision: 1 } },
    { session, returnDocument: "after", runValidators: true },
  );
  if (!updated) conflict();
  await ensureMetricBreach({
    ticket,
    cycle: updated,
    pauses: [],
    metric: "RESPONSE",
    at,
    actorId,
    session,
  });
  return true;
}

export async function finishCycle(ticket, at, endReason, actorId, session) {
  const cycle = await SlaCycle.findOne({
    organization: ticket.organization,
    ticket: ticket._id,
    cycleNumber: ticket.slaCycleNumber,
    endedAt: { $exists: false },
  }).session(session);
  if (!cycle) conflict();
  const pauses = await SlaPause.find({
    organization: ticket.organization,
    ticket: ticket._id,
    cycleNumber: ticket.slaCycleNumber,
  }).session(session).lean();
  const fields = resolutionCompletionFields(cycle, pauses, at, endReason);
  fields.isOpen = false;
  const updated = await SlaCycle.findOneAndUpdate(
    { _id: cycle._id, clockRevision: cycle.clockRevision, endedAt: { $exists: false } },
    { $set: fields, $inc: { clockRevision: 1 } },
    { session, returnDocument: "after", runValidators: true },
  );
  if (!updated) conflict();
  await ensureMetricBreach({
    ticket,
    cycle: updated,
    pauses,
    metric: "RESPONSE",
    at,
    actorId,
    session,
  });
  await SlaCycle.updateOne(
    { _id: updated._id },
    { $set: { responseEvaluationComplete: true } },
    { session },
  );
  if (endReason === "RESOLVED") {
    await ensureMetricBreach({
      ticket,
      cycle: updated,
      pauses,
      metric: "RESOLUTION",
      at,
      actorId,
      session,
    });
    await SlaCycle.updateOne(
      { _id: updated._id },
      { $set: { resolutionEvaluationComplete: true } },
      { session },
    );
  }
  return updated;
}

export async function applyPriorityChange(ticket, newPriority, actorId, reason, at, session) {
  const cycle = await SlaCycle.findOne({
    organization: ticket.organization,
    ticket: ticket._id,
    cycleNumber: ticket.slaCycleNumber,
    endedAt: { $exists: false },
  }).session(session);
  if (!cycle || cycle.priority === newPriority) return null;
  const pauses = await SlaPause.find({
    organization: ticket.organization,
    ticket: ticket._id,
    cycleNumber: ticket.slaCycleNumber,
  }).session(session).lean();
  const fields = priorityChangeFields(cycle, pauses, newPriority, actorId, reason, at);
  const updated = await SlaCycle.findOneAndUpdate(
    { _id: cycle._id, clockRevision: cycle.clockRevision, endedAt: { $exists: false } },
    {
      $set: {
        priority: fields.priority,
        ...(fields.responseBudgetSeconds
          ? { responseBudgetSeconds: fields.responseBudgetSeconds }
          : {}),
        resolutionBudgetSeconds: fields.resolutionBudgetSeconds,
        ...(fields.cachedResponseDueAt
          ? { cachedResponseDueAt: fields.cachedResponseDueAt }
          : {}),
        ...(fields.cachedResolutionDueAt
          ? { cachedResolutionDueAt: fields.cachedResolutionDueAt }
          : {}),
        priorityChanges: fields.priorityChanges,
      },
      $inc: { clockRevision: 1 },
    },
    { session, returnDocument: "after", runValidators: true },
  );
  if (!updated) conflict();
  const responseBreach = await ensureMetricBreach({
    ticket,
    cycle: updated,
    pauses,
    metric: "RESPONSE",
    at,
    actorId,
    session,
  });
  const resolutionBreach = await ensureMetricBreach({
    ticket,
    cycle: updated,
    pauses,
    metric: "RESOLUTION",
    at,
    actorId,
    session,
  });
  if (responseBreach || resolutionBreach) {
    await SlaCycle.updateOne(
      { _id: updated._id },
      {
        $set: {
          ...(responseBreach ? { responseEvaluationComplete: true } : {}),
          ...(resolutionBreach ? { resolutionEvaluationComplete: true } : {}),
        },
      },
      { session },
    );
  }
  return fields.priorityChanges.at(-1);
}
