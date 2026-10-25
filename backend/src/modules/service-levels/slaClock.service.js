import { AppError } from "../../shared/errors/app-error.js";
import { clockNow } from "../../shared/time/clock.js";
import {
  addBusinessMilliseconds,
  addBusinessMillisecondsWithPauses,
  businessMilliseconds,
  normalizeCalendarSnapshot,
  pauseBusinessMilliseconds,
} from "./businessTime.js";
import { SlaBreach } from "./slaBreach.model.js";
import { SlaCycle } from "./slaCycle.model.js";
import { SlaPause } from "./slaPause.model.js";

function reconciliation(message) {
  return new AppError(409, "SLA_RECONCILIATION_REQUIRED", message);
}

function integerSeconds(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw reconciliation(`${label} is missing or invalid in the historical SLA snapshot.`);
  }
  return value;
}

export function targetForPriority(policySnapshot, priority) {
  if (!policySnapshot?._id || !Number.isSafeInteger(policySnapshot.revision)) {
    throw reconciliation("The SLA policy identity or revision is missing from the historical snapshot.");
  }
  const target = policySnapshot.targets?.[priority];
  if (!target) throw reconciliation(`The historical policy has no ${priority} target.`);
  // Explicit legacy minute values are convertible history, not invented history.
  const responseSeconds = target.responseSeconds ??
    (Number.isFinite(target.responseMinutes) ? target.responseMinutes * 60 : undefined);
  const resolutionSeconds = target.resolutionSeconds ??
    (Number.isFinite(target.resolutionMinutes) ? target.resolutionMinutes * 60 : undefined);
  return {
    responseSeconds: integerSeconds(responseSeconds, `${priority} response budget`),
    resolutionSeconds: integerSeconds(resolutionSeconds, `${priority} resolution budget`),
  };
}

export function validateConfigurationSnapshots(snapshots) {
  if (!snapshots?.service?._id || !snapshots?.slaPolicy || !snapshots?.businessCalendar?._id ||
      !Number.isSafeInteger(snapshots.businessCalendar.revision)) {
    throw reconciliation("The ticket lacks complete service, policy, or calendar snapshot identity.");
  }
  normalizeCalendarSnapshot(snapshots.businessCalendar);
  return snapshots;
}

export function newCycleClockFields(configurationSnapshots, priority, startedAt) {
  validateConfigurationSnapshots(configurationSnapshots);
  const target = targetForPriority(configurationSnapshots.slaPolicy, priority);
  const calendar = configurationSnapshots.businessCalendar;
  return {
    priority,
    responseBudgetSeconds: target.responseSeconds,
    resolutionBudgetSeconds: target.resolutionSeconds,
    cachedResponseDueAt: addBusinessMilliseconds(
      startedAt,
      target.responseSeconds * 1000,
      calendar,
    ),
    cachedResolutionDueAt: addBusinessMilliseconds(
      startedAt,
      target.resolutionSeconds * 1000,
      calendar,
    ),
    responseEvaluationComplete: false,
    resolutionEvaluationComplete: false,
    clockRevision: 0,
  };
}

function cycleBudgets(cycle) {
  validateConfigurationSnapshots(cycle.configurationSnapshots);
  if (!cycle.priority) throw reconciliation("The SLA cycle priority is missing.");
  const snapshotTarget = targetForPriority(
    cycle.configurationSnapshots.slaPolicy,
    cycle.priority,
  );
  return {
    responseSeconds: integerSeconds(
      cycle.responseBudgetSeconds ?? snapshotTarget.responseSeconds,
      "Response budget",
    ),
    resolutionSeconds: integerSeconds(
      cycle.resolutionBudgetSeconds ?? snapshotTarget.resolutionSeconds,
      "Resolution budget",
    ),
  };
}

function seconds(milliseconds) {
  return Math.floor(milliseconds / 1000);
}

function metricStatus({ completed, elapsedMilliseconds, budgetSeconds, stopped, excluded }) {
  if (excluded) return "EXCLUDED";
  if (completed) return elapsedMilliseconds <= budgetSeconds * 1000 ? "MET" : "BREACHED";
  if (elapsedMilliseconds > budgetSeconds * 1000) return "BREACHED";
  if (stopped) return "STOPPED";
  return "RUNNING";
}

export function measureCycle(cycle, pauses = [], breaches = [], now = new Date()) {
  const budgets = cycleBudgets(cycle);
  const calendar = cycle.configurationSnapshots.businessCalendar;
  const end = cycle.endedAt ? new Date(cycle.endedAt) : new Date(now);
  const responseEnd = cycle.firstResponseAt ? new Date(cycle.firstResponseAt) : end;
  const responseElapsedMilliseconds = businessMilliseconds(
    cycle.startedAt,
    responseEnd,
    calendar,
  );
  const pausedMilliseconds = pauseBusinessMilliseconds(
    pauses.filter((pause) => pause.clock === "RESOLUTION"),
    cycle.startedAt,
    end,
    calendar,
  );
  const resolutionElapsedMilliseconds = Math.max(
    0,
    businessMilliseconds(cycle.startedAt, end, calendar) - pausedMilliseconds,
  );
  const openPause = pauses.find((pause) => pause.clock === "RESOLUTION" && !pause.endedAt);
  const responseDueAt = addBusinessMilliseconds(
    cycle.startedAt,
    budgets.responseSeconds * 1000,
    calendar,
  );
  const resolutionDueAt = openPause
    ? null
    : addBusinessMillisecondsWithPauses(
        cycle.startedAt,
        budgets.resolutionSeconds * 1000,
        calendar,
        pauses.filter((pause) => pause.clock === "RESOLUTION"),
      );
  const resolutionExcluded = ["CANCELLED", "REJECTED"].includes(cycle.endReason);
  const responseStatus = metricStatus({
    completed: Boolean(cycle.firstResponseAt),
    elapsedMilliseconds: responseElapsedMilliseconds,
    budgetSeconds: cycle.responseBudgetAtCompletionSeconds || budgets.responseSeconds,
    stopped: Boolean(cycle.endedAt),
  });
  let resolutionStatus = metricStatus({
    completed: cycle.endReason === "RESOLVED",
    elapsedMilliseconds: resolutionElapsedMilliseconds,
    budgetSeconds: cycle.resolutionBudgetAtCompletionSeconds || budgets.resolutionSeconds,
    stopped: Boolean(cycle.endedAt),
    excluded: resolutionExcluded,
  });
  if (!cycle.endedAt && openPause && resolutionStatus === "RUNNING") resolutionStatus = "PAUSED";
  const breachMap = new Map(breaches.map((breach) => [breach.metric, breach]));
  return {
    cycleNumber: cycle.cycleNumber,
    originalSubmittedAt: cycle.originalSubmittedAt,
    startedAt: cycle.startedAt,
    endedAt: cycle.endedAt || null,
    endReason: cycle.endReason || null,
    resolutionTargetEligible: !resolutionExcluded,
    priority: cycle.priority,
    timezone: calendar.timezone,
    policy: {
      id: cycle.configurationSnapshots.slaPolicy._id.toString(),
      revision: cycle.configurationSnapshots.slaPolicy.revision,
      name: cycle.configurationSnapshots.slaPolicy.name,
    },
    calendar: {
      id: calendar._id.toString(),
      revision: calendar.revision,
      timezone: calendar.timezone,
    },
    pause: {
      isPaused: Boolean(openPause),
      reason: openPause?.reason || null,
      startedAt: openPause?.startedAt || null,
    },
    response: {
      status: responseStatus,
      budgetSeconds: cycle.responseBudgetAtCompletionSeconds || budgets.responseSeconds,
      currentBudgetSeconds: budgets.responseSeconds,
      elapsedBusinessSeconds: seconds(responseElapsedMilliseconds),
      remainingBusinessSeconds: Math.max(0, budgets.responseSeconds - seconds(responseElapsedMilliseconds)),
      completedAt: cycle.firstResponseAt || null,
      dueAt: responseDueAt,
      historicalBreach: Boolean(breachMap.get("RESPONSE")),
      breachDetectedAt: breachMap.get("RESPONSE")?.detectedAt || null,
    },
    resolution: {
      status: resolutionStatus,
      budgetSeconds: cycle.resolutionBudgetAtCompletionSeconds || budgets.resolutionSeconds,
      currentBudgetSeconds: budgets.resolutionSeconds,
      elapsedBusinessSeconds: seconds(resolutionElapsedMilliseconds),
      pausedBusinessSeconds: seconds(pausedMilliseconds),
      remainingBusinessSeconds: Math.max(0, budgets.resolutionSeconds - seconds(resolutionElapsedMilliseconds)),
      completedAt: cycle.endReason === "RESOLVED" ? cycle.endedAt : null,
      dueAt: resolutionDueAt,
      dueAtAuthoritative: !openPause,
      historicalBreach: Boolean(breachMap.get("RESOLUTION")),
      breachDetectedAt: breachMap.get("RESOLUTION")?.detectedAt || null,
    },
  };
}

// Compatibility for existing operational tests and internal callers.
export function cycleElapsed(cycle, pauses, now = new Date()) {
  try {
    const measured = measureCycle(cycle, pauses, [], now);
    return {
      cycleNumber: measured.cycleNumber,
      originalSubmittedAt: measured.originalSubmittedAt,
      startedAt: measured.startedAt,
      endedAt: measured.endedAt,
      endReason: measured.endReason,
      resolutionTargetEligible: measured.resolutionTargetEligible,
      firstResponseAt: measured.response.completedAt,
      responseElapsedMilliseconds: measured.response.elapsedBusinessSeconds * 1000,
      resolutionElapsedMilliseconds: measured.resolution.elapsedBusinessSeconds * 1000,
      resolutionPausedMilliseconds: measured.resolution.pausedBusinessSeconds * 1000,
    };
  } catch (error) {
    // Pre-Step-9 callers may inspect elapsed history that has no target metadata.
    if (error.code !== "SLA_RECONCILIATION_REQUIRED") throw error;
    const end = cycle.endedAt || now;
    const calendar = cycle.configurationSnapshots.businessCalendar;
    const responseEnd = cycle.firstResponseAt && cycle.firstResponseAt < end
      ? cycle.firstResponseAt
      : end;
    const paused = pauseBusinessMilliseconds(
      pauses.filter((pause) => pause.clock === "RESOLUTION"),
      cycle.startedAt,
      end,
      calendar,
    );
    return {
      cycleNumber: cycle.cycleNumber,
      originalSubmittedAt: cycle.originalSubmittedAt,
      startedAt: cycle.startedAt,
      endedAt: cycle.endedAt || null,
      endReason: cycle.endReason || null,
      resolutionTargetEligible: !["REJECTED", "CANCELLED"].includes(cycle.endReason),
      firstResponseAt: cycle.firstResponseAt || null,
      responseElapsedMilliseconds: businessMilliseconds(cycle.startedAt, responseEnd, calendar),
      resolutionElapsedMilliseconds: Math.max(
        0,
        businessMilliseconds(cycle.startedAt, end, calendar) - paused,
      ),
      resolutionPausedMilliseconds: paused,
    };
  }
}

export function responseCompletionFields(cycle, completedAt) {
  const measured = measureCycle(cycle, [], [], completedAt);
  return {
    firstResponseAt: completedAt,
    responseElapsedSeconds: measured.response.elapsedBusinessSeconds,
    responseBudgetAtCompletionSeconds: measured.response.currentBudgetSeconds,
    cachedResponseDueAt: measured.response.dueAt,
    responseEvaluationComplete: true,
  };
}

export function resolutionCompletionFields(cycle, pauses, completedAt, endReason) {
  const provisional = {
    ...cycle.toObject?.() || cycle,
    endedAt: completedAt,
    endReason,
  };
  const measured = measureCycle(provisional, pauses, [], completedAt);
  return {
    endedAt: completedAt,
    endReason,
    resolutionElapsedSeconds: measured.resolution.elapsedBusinessSeconds,
    resolutionPausedSeconds: measured.resolution.pausedBusinessSeconds,
    resolutionBudgetAtCompletionSeconds: measured.resolution.currentBudgetSeconds,
    cachedResolutionDueAt: measured.resolution.dueAt || undefined,
    resolutionEvaluationComplete: ["CANCELLED", "REJECTED"].includes(endReason),
  };
}

export function priorityChangeFields(cycle, pauses, newPriority, actor, reason, changedAt) {
  const currentBudgets = cycleBudgets(cycle);
  const target = targetForPriority(cycle.configurationSnapshots.slaPolicy, newPriority);
  const responseCompleted = Boolean(cycle.firstResponseAt);
  const resolutionDueAt = (pauses || []).some((pause) => !pause.endedAt)
    ? undefined
    : addBusinessMillisecondsWithPauses(
        cycle.startedAt,
        target.resolutionSeconds * 1000,
        cycle.configurationSnapshots.businessCalendar,
        pauses,
      );
  return {
    priority: newPriority,
    ...(!responseCompleted
      ? {
          responseBudgetSeconds: target.responseSeconds,
          cachedResponseDueAt: addBusinessMilliseconds(
            cycle.startedAt,
            target.responseSeconds * 1000,
            cycle.configurationSnapshots.businessCalendar,
          ),
        }
      : {}),
    resolutionBudgetSeconds: target.resolutionSeconds,
    ...(resolutionDueAt ? { cachedResolutionDueAt: resolutionDueAt } : {}),
    priorityChanges: [
      ...(cycle.priorityChanges || []),
      {
        previousPriority: cycle.priority,
        newPriority,
        previousResponseBudgetSeconds: currentBudgets.responseSeconds,
        newResponseBudgetSeconds: responseCompleted
          ? currentBudgets.responseSeconds
          : target.responseSeconds,
        previousResolutionBudgetSeconds: currentBudgets.resolutionSeconds,
        newResolutionBudgetSeconds: target.resolutionSeconds,
        actor,
        reason,
        changedAt,
      },
    ],
  };
}

export async function ticketSlaCycles(ticket, now = clockNow()) {
  const filter = { organization: ticket.organization, ticket: ticket._id };
  const [cycles, pauses, breaches] = await Promise.all([
    SlaCycle.find(filter).sort({ cycleNumber: 1 }).lean(),
    SlaPause.find(filter).sort({ startedAt: 1 }).lean(),
    SlaBreach.find(filter).sort({ detectedAt: 1 }).lean(),
  ]);
  return cycles.map((cycle) => {
    try {
      return measureCycle(
        cycle,
        pauses.filter((pause) => pause.cycleNumber === cycle.cycleNumber),
        breaches.filter((breach) => breach.cycleNumber === cycle.cycleNumber),
        now,
      );
    } catch (error) {
      if (error.code !== "SLA_RECONCILIATION_REQUIRED") throw error;
      return {
        cycleNumber: cycle.cycleNumber,
        startedAt: cycle.startedAt,
        endedAt: cycle.endedAt || null,
        reconciliationRequired: true,
        reconciliationMessage: error.message,
      };
    }
  });
}
