import { AccessGrant } from "../access/accessGrant.model.js";
import { recordRequiredAuditEvent } from "../auth/audit.service.js";
import { OutboxEvent } from "../outbox/outboxEvent.model.js";
import { User } from "../users/user.model.js";
import { TicketEvent } from "../tickets/ticketEvent.model.js";
import { addBusinessMillisecondsWithPauses } from "./businessTime.js";
import { measureCycle } from "./slaClock.service.js";
import { SlaBreach } from "./slaBreach.model.js";

async function eligibleAssignedTechnician(ticket, session) {
  if (!ticket.assignee) return [];
  const [user, grant] = await Promise.all([
    User.exists({
      _id: ticket.assignee,
      organization: ticket.organization,
      role: "TECHNICIAN",
      accountStatus: "ACTIVE",
    }).session(session),
    AccessGrant.exists({
      organization: ticket.organization,
      user: ticket.assignee,
      capability: "support",
      isActive: true,
      revokedAt: { $exists: false },
      $or: [{ department: ticket.requesterDepartment }, { department: null }],
    }).session(session),
  ]);
  return user && grant ? [ticket.assignee] : [];
}

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
  await TicketEvent.create([{
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
  await OutboxEvent.create([{
    organization: ticket.organization,
    aggregateType: "TICKET",
    aggregateId: ticket._id,
    eventType: `TICKET_${type}`,
    visibility: "INTERNAL",
    requiresAuthorization: true,
    recipients: {
      userIds: await eligibleAssignedTechnician(ticket, session),
      capability: "ticket_triage",
      department: ticket.requesterDepartment,
    },
    payload: {
      ticketId: ticket._id.toString(),
      reference: ticket.reference,
      metric,
      cycleNumber: cycle.cycleNumber,
    },
    status: "PENDING",
  }], { session });
  return breach;
}
