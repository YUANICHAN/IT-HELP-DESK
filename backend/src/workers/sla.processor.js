import { isDuplicateKeyError, runRequiredTransaction } from "../shared/database/transaction.js";
import { clockNow } from "../shared/time/clock.js";
import { Ticket } from "../modules/tickets/ticket.model.js";
import { ensureMetricBreach } from "../modules/service-levels/slaBreach.service.js";
import { measureCycle } from "../modules/service-levels/slaClock.service.js";
import { SlaCycle } from "../modules/service-levels/slaCycle.model.js";
import { SlaPause } from "../modules/service-levels/slaPause.model.js";

export async function evaluateSlaCycle(cycleId, at = clockNow()) {
  try {
    return await runRequiredTransaction(async (session) => {
      const cycle = await SlaCycle.findById(cycleId).session(session);
      if (!cycle) return { evaluated: false, breaches: 0 };
      const ticket = await Ticket.findOne({
        _id: cycle.ticket,
        organization: cycle.organization,
      }).session(session);
      if (!ticket) return { evaluated: false, breaches: 0 };
      const pauses = await SlaPause.find({
        organization: cycle.organization,
        ticket: cycle.ticket,
        cycleNumber: cycle.cycleNumber,
      }).session(session).lean();
      let measured;
      try {
        measured = measureCycle(cycle, pauses, [], at);
      } catch (error) {
        if (error.code !== "SLA_RECONCILIATION_REQUIRED") throw error;
        return { evaluated: true, reconciliationRequired: true, breaches: 0 };
      }
      const responseBreach = measured.response.status === "BREACHED";
      const resolutionBreach =
        measured.resolution.status === "BREACHED" &&
        measured.resolution.status !== "EXCLUDED";
      const responseFinished = Boolean(cycle.firstResponseAt || cycle.endedAt);
      const resolutionFinished = Boolean(cycle.endedAt);
      if (!responseBreach && !resolutionBreach && !responseFinished && !resolutionFinished) {
        return { evaluated: true, breaches: 0 };
      }
      const update = await SlaCycle.findOneAndUpdate(
        { _id: cycle._id, clockRevision: cycle.clockRevision },
        {
          $set: {
            ...(responseBreach || responseFinished
              ? { responseEvaluationComplete: true }
              : {}),
            ...(resolutionBreach || resolutionFinished
              ? { resolutionEvaluationComplete: true }
              : {}),
          },
          $inc: { clockRevision: 1 },
        },
        { session, returnDocument: "after" },
      );
      if (!update) return { evaluated: false, stale: true, breaches: 0 };
      let count = 0;
      if (responseBreach) {
        if (await ensureMetricBreach({
          ticket,
          cycle: update,
          pauses,
          metric: "RESPONSE",
          at,
          detectedAt: at,
          session,
        })) count += 1;
      }
      if (resolutionBreach) {
        if (await ensureMetricBreach({
          ticket,
          cycle: update,
          pauses,
          metric: "RESOLUTION",
          at,
          detectedAt: at,
          session,
        })) count += 1;
      }
      return { evaluated: true, breaches: count };
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return { evaluated: true, duplicateSuppressed: true, breaches: 0 };
    }
    throw error;
  }
}

export async function evaluateSlaBreaches({
  at = clockNow(),
  limit = 200,
} = {}) {
  const candidates = await SlaCycle.find({
    $or: [
      {
        responseEvaluationComplete: { $ne: true },
        $or: [
          { firstResponseAt: { $exists: true } },
          { endedAt: { $exists: true } },
          { cachedResponseDueAt: { $lt: at } },
        ],
      },
      {
        resolutionEvaluationComplete: { $ne: true },
        $or: [
          { endedAt: { $exists: true } },
          { cachedResolutionDueAt: { $lt: at } },
        ],
      },
    ],
  })
    .sort({ cachedResponseDueAt: 1, cachedResolutionDueAt: 1, _id: 1 })
    .limit(limit)
    .select({ _id: 1 })
    .lean();
  const summary = {
    examined: candidates.length,
    evaluated: 0,
    breaches: 0,
    reconciliationRequired: 0,
  };
  for (const candidate of candidates) {
    const result = await evaluateSlaCycle(candidate._id, at);
    if (result.evaluated) summary.evaluated += 1;
    summary.breaches += result.breaches || 0;
    if (result.reconciliationRequired) summary.reconciliationRequired += 1;
  }
  return summary;
}
