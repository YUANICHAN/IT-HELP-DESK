import { currentAccess } from "../access/currentAccess.service.js";
import {
  canViewInternal,
  viewerKind,
} from "../tickets/ticket.policy.js";
import {
  loadAccessibleTicket,
} from "../tickets/ticketOperations.service.js";
import { clockNow } from "../../shared/time/clock.js";
import { measureCycle } from "./slaClock.service.js";
import { SlaBreach } from "./slaBreach.model.js";
import { SlaCycle } from "./slaCycle.model.js";
import { SlaPause } from "./slaPause.model.js";
import { requesterSafeCycle } from "./serviceLevel.serializer.js";

export async function serviceLevelForTicket(authentication, ticketId, now = clockNow()) {
  const auth = await currentAccess(authentication);
  const ticket = await loadAccessibleTicket(auth, ticketId);
  const filter = { organization: ticket.organization, ticket: ticket._id };
  const [cycles, pauses, breaches] = await Promise.all([
    SlaCycle.find(filter).sort({ cycleNumber: 1 }).lean(),
    SlaPause.find(filter).sort({ startedAt: 1, _id: 1 }).lean(),
    SlaBreach.find(filter).sort({ detectedAt: 1, _id: 1 }).lean(),
  ]);
  const measured = cycles.map((cycle) => {
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
  const current = measured.find((cycle) => cycle.cycleNumber === ticket.slaCycleNumber) ||
    measured.at(-1) || null;
  const staff = canViewInternal(auth, ticket);
  const response = {
    units: "seconds",
    viewer: viewerKind(auth, ticket),
    timezone: current?.timezone || ticket.configurationSnapshots.businessCalendar?.timezone || null,
    currentCycle: current ? requesterSafeCycle(current) : null,
  };
  if (staff) {
    response.cycles = measured;
    response.pauses = pauses.map((pause) => ({
      id: pause._id.toString(),
      cycleNumber: pause.cycleNumber,
      clock: pause.clock,
      reason: pause.reason,
      startedAt: pause.startedAt,
      startedBy: pause.startedBy?.toString() || null,
      endedAt: pause.endedAt,
      endedBy: pause.endedBy?.toString() || null,
      endReason: pause.endReason || null,
    }));
    response.priorityChanges = cycles.flatMap((cycle) =>
      (cycle.priorityChanges || []).map((change) => ({
        cycleNumber: cycle.cycleNumber,
        ...change,
        actor: change.actor?.toString() || null,
      })),
    );
    response.breaches = breaches.map((breach) => ({
      id: breach._id.toString(),
      cycleNumber: breach.cycleNumber,
      metric: breach.metric,
      dueAt: breach.dueAt,
      detectedAt: breach.detectedAt,
      priority: breach.priority,
      budgetSeconds: breach.budgetSeconds,
      elapsedBusinessSeconds: breach.elapsedSeconds,
    }));
  }
  return response;
}
