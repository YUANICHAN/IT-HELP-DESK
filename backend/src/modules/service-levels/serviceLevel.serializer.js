export function metricSummary(metric) {
  return {
    status: metric.status,
    budgetSeconds: metric.budgetSeconds,
    currentBudgetSeconds: metric.currentBudgetSeconds,
    elapsedBusinessSeconds: metric.elapsedBusinessSeconds,
    ...(Object.hasOwn(metric, "pausedBusinessSeconds")
      ? { pausedBusinessSeconds: metric.pausedBusinessSeconds }
      : {}),
    remainingBusinessSeconds: metric.remainingBusinessSeconds,
    completedAt: metric.completedAt,
    dueAt: metric.dueAt,
    ...(Object.hasOwn(metric, "dueAtAuthoritative")
      ? { dueAtAuthoritative: metric.dueAtAuthoritative }
      : {}),
    historicalBreach: metric.historicalBreach,
  };
}

export function requesterSafeCycle(cycle) {
  if (cycle.reconciliationRequired) return cycle;
  return {
    cycleNumber: cycle.cycleNumber,
    originalSubmittedAt: cycle.originalSubmittedAt,
    startedAt: cycle.startedAt,
    endedAt: cycle.endedAt,
    endReason: cycle.endReason,
    resolutionTargetEligible: cycle.resolutionTargetEligible,
    priority: cycle.priority,
    timezone: cycle.timezone,
    pause: { isPaused: cycle.pause.isPaused },
    response: metricSummary(cycle.response),
    resolution: metricSummary(cycle.resolution),
  };
}
