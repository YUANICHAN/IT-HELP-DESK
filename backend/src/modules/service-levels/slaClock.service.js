import { SlaCycle } from "./slaCycle.model.js";
import { SlaPause } from "./slaPause.model.js";
import { businessMilliseconds } from "./businessTime.js";
export function cycleElapsed(cycle, pauses, now = new Date()) {
  const end = cycle.endedAt || now,
    calendar = cycle.configurationSnapshots.businessCalendar;
  const elapsed = businessMilliseconds(cycle.startedAt, end, calendar);
  const responseEnd = cycle.firstResponseAt && cycle.firstResponseAt < end ? cycle.firstResponseAt : end;
  const intervals = pauses.filter(p => p.clock === "RESOLUTION").map(p => [Math.max(+cycle.startedAt, +p.startedAt), Math.min(+end, +(p.endedAt || now))]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let paused = 0,
    edge = +cycle.startedAt;
  for (const [a, b] of intervals) {
    if (b > edge) paused += businessMilliseconds(new Date(Math.max(a, edge)), new Date(b), calendar);
    edge = Math.max(edge, b);
  }
  return {
    cycleNumber: cycle.cycleNumber,
    originalSubmittedAt: cycle.originalSubmittedAt,
    startedAt: cycle.startedAt,
    endedAt: cycle.endedAt || null,
    endReason: cycle.endReason || null,
    firstResponseAt: cycle.firstResponseAt || null,
    responseElapsedMilliseconds: businessMilliseconds(cycle.startedAt, responseEnd, calendar),
    resolutionElapsedMilliseconds: Math.max(0, elapsed - paused),
    resolutionPausedMilliseconds: paused
  };
}
export async function ticketSlaCycles(ticket) {
  const filter = {
    organization: ticket.organization,
    ticket: ticket._id
  };
  const [cycles, pauses] = await Promise.all([SlaCycle.find(filter).sort({
    cycleNumber: 1
  }).lean(), SlaPause.find(filter).lean()]);
  const now = new Date();
  return cycles.map(cycle => cycleElapsed(cycle, pauses.filter(p => p.cycleNumber === cycle.cycleNumber), now));
}
