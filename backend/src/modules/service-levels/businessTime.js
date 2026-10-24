import { AppError } from "../../shared/errors/app-error.js";
const days = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map(v => [v.type, v.value]));
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, date.getUTCMilliseconds()));
}
function localInstant(local, timezone) {
  let instant = new Date(local);
  for (let i = 0; i < 4; i++) instant = new Date(instant.getTime() + local.getTime() - localParts(instant, timezone).getTime());
  return instant;
}

// Half-open business windows; overlapping windows are merged so elapsed time is never double counted.
export function businessMilliseconds(start, end, calendar) {
  if (end <= start) return 0;
  const timezone = calendar.timezone;
  const first = localParts(new Date(start), timezone),
    last = localParts(new Date(end), timezone);
  first.setUTCHours(0, 0, 0, 0);
  last.setUTCHours(0, 0, 0, 0);
  const holidays = new Set((calendar.holidays || []).map(h => typeof h === "string" ? h : h.date));
  let total = 0;
  for (const day = new Date(first); day <= last; day.setUTCDate(day.getUTCDate() + 1)) {
    if (holidays.has(day.toISOString().slice(0, 10))) continue;
    const intervals = [];
    for (const window of calendar.weeklyWindows || []) {
      if ((typeof window.day === "number" ? days[window.day] : window.day) !== days[day.getUTCDay()]) continue;
      if (!/^\d{2}:\d{2}$/u.test(window.start) || !/^\d{2}:\d{2}$/u.test(window.end) || window.start >= window.end) throw new AppError(409, "CALENDAR_UNAVAILABLE", "The snapshotted calendar contains an invalid business window.");
      const [sh, sm] = window.start.split(":").map(Number),
        [eh, em] = window.end.split(":").map(Number);
      if (sh > 23 || eh > 24 || sm > 59 || em > 59 || eh === 24 && em !== 0) throw new AppError(409, "CALENDAR_UNAVAILABLE", "The snapshotted calendar contains an invalid business window.");
      const from = new Date(day);
      from.setUTCHours(sh, sm);
      const to = new Date(day);
      to.setUTCHours(eh, em);
      const a = Math.max(+start, +localInstant(from, timezone)),
        b = Math.min(+end, +localInstant(to, timezone));
      if (b > a) intervals.push([a, b]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let edge = -Infinity;
    for (const [a, b] of intervals) {
      total += Math.max(0, b - Math.max(a, edge));
      edge = Math.max(edge, b);
    }
  }
  return total;
}
// Deadline is the same local wall time on the third subsequent scheduled business date.
// Weekends/non-working dates and full-day holidays do not consume a day.
export function reopenDeadline(resolvedAt, calendar) {
  const timezone = calendar.timezone;
  const working = new Set((calendar.weeklyWindows || []).filter(w => w.start < w.end).map(w => typeof w.day === "number" ? days[w.day] : w.day));
  if (!working.size) throw new AppError(409, "CALENDAR_UNAVAILABLE", "The snapshotted calendar has no business days.");
  const holidays = new Set((calendar.holidays || []).map(h => typeof h === "string" ? h : h.date));
  const local = localParts(new Date(resolvedAt), timezone);
  let remaining = 3;
  for (let count = 0; remaining && count < 3660; count++) {
    local.setUTCDate(local.getUTCDate() + 1);
    if (working.has(days[local.getUTCDay()]) && !holidays.has(local.toISOString().slice(0, 10))) remaining--;
  }
  if (remaining) throw new AppError(409, "CALENDAR_UNAVAILABLE", "No reopening deadline can be calculated.");
  return localInstant(local, timezone);
}
