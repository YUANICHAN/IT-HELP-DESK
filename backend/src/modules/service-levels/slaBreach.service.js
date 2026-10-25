import { recordRequiredAuditEvent } from "../auth/audit.service.js";
import { enqueueTicketNotifications } from "../notifications/ticketNotifications.service.js";
import { TicketEvent } from "../tickets/ticketEvent.model.js";
import { addBusinessMillisecondsWithPauses } from "./businessTime.js";
import { measureCycle } from "./slaClock.service.js";
import { SlaBreach } from "./slaBreach.model.js";

function resolutionBreachDue(cycle, pauses, at, budgetSeconds) {
  return addBusinessMillisecondsWithPauses(
    cycle.startedAt,
    budgetSeconds * 1000,
    cycle.configurationSnapshots.businessCalendar,
    pauses.map((pause) => ({
      ...pause,
      endedAt: pause.endedAt || at,
    })),
  );
}

export async function ensureMetricBreach({
  ticket,
  cycle,
  pauses,
  metric,
  at,
  detectedAt = at,
  actorId,
  session,
}) {
  const measured = measureCycle(cycle, pauses, [], at);
  const result = metric === "RESPONSE" ? measured.response : measured.resolution;
  if (result.status !== "BREACHED") return null;
  const existing = await SlaBreach.findOne({
    organization: ticket.organization,
    cycle: cycle._id,
    metric,
  }).session(session);
  if (existing) return existing;
  const dueAt = metric === "RESPONSE"
    ? result.dueAt
    : result.dueAt || resolutionBreachDue(
        cycle,
        pauses,
        at,
        result.currentBudgetSeconds,
      );
  const [breach] = await SlaBreach.create([{
    organization: ticket.organization,
    ticket: ticket._id,
    cycle: cycle._id,
    cycleNumber: cycle.cycleNumber,
    metric,
    dueAt,
    detectedAt,
    priority: cycle.priority,
    budgetSeconds: result.currentBudgetSeconds,
    elapsedSeconds: result.elapsedBusinessSeconds,
    clockRevision: cycle.clockRevision,
  }], { session });
  const type = `SLA_${metric}_BREACHED`;
  const data = {
    metric,
    cycleNumber: cycle.cycleNumber,
    dueAt,
    priority: cycle.priority,
    budgetSeconds: result.currentBudgetSeconds,
  };
  const [event] = await TicketEvent.create([{
    organization: ticket.organization,
    ticket: ticket._id,
    actor: actorId,
    type,
    visibility: "PUBLIC",
    data,
    occurredAt: detectedAt,
  }], { session });
  await recordRequiredAuditEvent({
    eventType: `TICKET_${type}`,
    outcome: "SUCCESS",
    organization: ticket.organization,
    user: actorId,
    department: ticket.requesterDepartment,
    ticket: ticket._id,
    ticketReference: ticket.reference,
    occurredAt: detectedAt,
  }, session);
  await enqueueTicketNotifications({
    ticket,
    event,
    type,
    actorId,
    data,
    occurredAt: detectedAt,
  }, session);
  return breach;
}
