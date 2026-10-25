import { AppError } from "../../shared/errors/app-error.js";

export const WEEKDAYS = Object.freeze([
  "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY",
]);

export const DEFAULT_WEEKLY_WINDOWS = Object.freeze(
  ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].flatMap((day) => [
    Object.freeze({ day, start: "08:00", end: "12:00" }),
    Object.freeze({ day, start: "13:00", end: "17:00" }),
  ]),
);

const formatterCache = new Map();

function unavailable(message) {
  return new AppError(409, "SLA_RECONCILIATION_REQUIRED", message);
}

function formatter(timezone) {
  if (!formatterCache.has(timezone)) {
    try {
      formatterCache.set(timezone, new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }));
    } catch {
      throw unavailable("The snapshotted calendar timezone is invalid.");
    }
  }
  return formatterCache.get(timezone);
}

function zonedParts(value, timezone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw unavailable("An SLA timestamp is invalid.");
  const parts = Object.fromEntries(
    formatter(timezone).formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    millisecond: date.getUTCMilliseconds(),
  };
}

function civilMilliseconds(parts) {
  return Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour || 0,
    parts.minute || 0, parts.second || 0, parts.millisecond || 0,
  );
}

function sameWallTime(left, right) {
  return ["year", "month", "day", "hour", "minute", "second"].every(
    (part) => left[part] === right[part],
  );
}

function possibleInstants(parts, timezone) {
  const wall = civilMilliseconds(parts);
  const offsets = new Set();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = new Date(wall + hours * 3_600_000);
    offsets.add(civilMilliseconds(zonedParts(sample, timezone)) - sample.getTime());
  }
  const matches = [];
  for (const offset of offsets) {
    const candidate = new Date(wall - offset);
    if (sameWallTime(zonedParts(candidate, timezone), parts)) matches.push(candidate);
  }
  return [...new Map(matches.map((date) => [date.getTime(), date])).values()]
    .sort((left, right) => left - right);
}

function addCivilMinutes(parts, minutes) {
  const shifted = new Date(civilMilliseconds(parts) + minutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
  };
}

// During a DST overlap, starts use the earlier instant and ends the later one,
// so both occurrences of scheduled wall time count. A boundary in a DST gap is
// shifted to the first valid local minute after the gap.
export function localDateTimeToInstant(parts, timezone, boundary = "start") {
  let matches = possibleInstants(parts, timezone);
  if (matches.length) return boundary === "end" ? matches.at(-1) : matches[0];
  for (let minute = 1; minute <= 180; minute += 1) {
    matches = possibleInstants(addCivilMinutes(parts, minute), timezone);
    if (matches.length) return matches[0];
  }
  throw unavailable("A calendar boundary cannot be represented in its timezone.");
}

function parseTime(value) {
  if (value === "24:00") return { hour: 24, minute: 0 };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(value || "")) {
    throw unavailable("The snapshotted calendar contains an invalid business window.");
  }
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function normalizedDay(value) {
  const day = typeof value === "number" ? WEEKDAYS[value] : value;
  if (!WEEKDAYS.includes(day)) {
    throw unavailable("The snapshotted calendar contains an invalid weekday.");
  }
  return day;
}

export function normalizeCalendarSnapshot(calendar) {
  if (!calendar || typeof calendar !== "object") {
    throw unavailable("The business-calendar snapshot is missing.");
  }
  const timezone = calendar.timezone;
  formatter(timezone);
  if (!Array.isArray(calendar.weeklyWindows) || calendar.weeklyWindows.length === 0) {
    throw unavailable("The business-calendar snapshot has no working windows.");
  }
  const weeklyWindows = calendar.weeklyWindows.map((window) => {
    const day = normalizedDay(window.day);
    const start = parseTime(window.start);
    const end = parseTime(window.end);
    const startMinute = start.hour * 60 + start.minute;
    const endMinute = end.hour * 60 + end.minute;
    if (startMinute >= endMinute || endMinute > 1440) {
      throw unavailable("Business windows must be positive and contained in one local day.");
    }
    return { day, start: window.start, end: window.end, startMinute, endMinute };
  });
  for (const day of WEEKDAYS) {
    const windows = weeklyWindows.filter((window) => window.day === day)
      .sort((left, right) => left.startMinute - right.startMinute);
    for (let index = 1; index < windows.length; index += 1) {
      if (windows[index].startMinute < windows[index - 1].endMinute) {
        throw unavailable("Business windows for the same day must not overlap.");
      }
    }
  }
  const holidays = new Set();
  for (const holiday of calendar.holidays || []) {
    const date = typeof holiday === "string" ? holiday : holiday?.date;
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date || "")) {
      throw unavailable("The snapshotted calendar contains an invalid holiday date.");
    }
    holidays.add(date);
  }
  return { timezone, weeklyWindows, holidays };
}

function dateKey(parts) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function civilDate(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function dateParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function intervalsForDate(parts, normalized) {
  if (normalized.holidays.has(dateKey(parts))) return [];
  const weekday = WEEKDAYS[civilDate(parts).getUTCDay()];
  return normalized.weeklyWindows.filter((window) => window.day === weekday)
    .map((window) => {
      const startHour = Math.floor(window.startMinute / 60);
      const endHour = Math.floor(window.endMinute / 60);
      const nextDay = endHour === 24;
      const endDate = nextDay
        ? dateParts(new Date(civilDate(parts).getTime() + 86_400_000))
        : parts;
      return [
        localDateTimeToInstant({
          ...parts, hour: startHour, minute: window.startMinute % 60, second: 0,
        }, normalized.timezone, "start"),
        localDateTimeToInstant({
          ...endDate, hour: nextDay ? 0 : endHour,
          minute: window.endMinute % 60, second: 0,
        }, normalized.timezone, "end"),
      ];
    });
}

export function businessIntervals(start, end, calendar) {
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw unavailable("An SLA interval contains an invalid timestamp.");
  }
  if (to <= from) return [];
  const normalized = normalizeCalendarSnapshot(calendar);
  const first = civilDate(zonedParts(from, normalized.timezone));
  const last = civilDate(zonedParts(to, normalized.timezone));
  const intervals = [];
  for (const day = new Date(first); day <= last; day.setUTCDate(day.getUTCDate() + 1)) {
    for (const [windowStart, windowEnd] of intervalsForDate(dateParts(day), normalized)) {
      const clippedStart = new Date(Math.max(from.getTime(), windowStart.getTime()));
      const clippedEnd = new Date(Math.min(to.getTime(), windowEnd.getTime()));
      if (clippedEnd > clippedStart) intervals.push([clippedStart, clippedEnd]);
    }
  }
  return intervals;
}

// Service intervals are half-open [start, end). Completion exactly at a
// deadline meets the target; breach begins only after the deadline.
export function businessMilliseconds(start, end, calendar) {
  return businessIntervals(start, end, calendar).reduce(
    (total, [intervalStart, intervalEnd]) =>
      total + intervalEnd.getTime() - intervalStart.getTime(),
    0,
  );
}

export function addBusinessMilliseconds(start, budgetMilliseconds, calendar) {
  if (!Number.isSafeInteger(budgetMilliseconds) || budgetMilliseconds < 0) {
    throw unavailable("The SLA business-time budget is invalid.");
  }
  const original = new Date(start);
  if (Number.isNaN(original.getTime())) throw unavailable("The SLA start time is invalid.");
  if (budgetMilliseconds === 0) return original;
  const normalized = normalizeCalendarSnapshot(calendar);
  const first = civilDate(zonedParts(original, normalized.timezone));
  let cursor = original.getTime();
  let remaining = budgetMilliseconds;
  for (let offset = 0; offset < 36_600; offset += 1) {
    const day = new Date(first);
    day.setUTCDate(day.getUTCDate() + offset);
    for (const [windowStart, windowEnd] of intervalsForDate(dateParts(day), normalized)) {
      const effectiveStart = Math.max(cursor, windowStart.getTime());
      const available = windowEnd.getTime() - effectiveStart;
      if (available <= 0) continue;
      if (remaining <= available) return new Date(effectiveStart + remaining);
      remaining -= available;
      cursor = windowEnd.getTime();
    }
  }
  throw unavailable("The SLA deadline exceeds the supported calendar range.");
}

export function pauseBusinessMilliseconds(pauses, start, end, calendar) {
  const lower = new Date(start).getTime();
  const upper = new Date(end).getTime();
  const intervals = (pauses || []).map((pause) => [
    Math.max(lower, new Date(pause.startedAt).getTime()),
    Math.min(
      upper,
      pause.endedAt == null ? upper : new Date(pause.endedAt).getTime(),
    ),
  ]).filter(([pauseStart, pauseEnd]) =>
    Number.isFinite(pauseStart) && Number.isFinite(pauseEnd) && pauseEnd > pauseStart,
  ).sort((left, right) => left[0] - right[0]);
  let total = 0;
  let edge = lower;
  for (const [pauseStart, pauseEnd] of intervals) {
    const effectiveStart = Math.max(edge, pauseStart);
    if (pauseEnd > effectiveStart) {
      total += businessMilliseconds(new Date(effectiveStart), new Date(pauseEnd), calendar);
      edge = Math.max(edge, pauseEnd);
    }
  }
  return total;
}

export function addBusinessMillisecondsWithPauses(start, budget, calendar, pauses) {
  if ((pauses || []).some((pause) => !pause.endedAt)) return null;
  let dueAt = addBusinessMilliseconds(start, budget, calendar);
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const paused = pauseBusinessMilliseconds(pauses, start, dueAt, calendar);
    const next = addBusinessMilliseconds(start, budget + paused, calendar);
    if (next.getTime() === dueAt.getTime()) return dueAt;
    dueAt = next;
  }
  throw unavailable("The pause history cannot be reconciled into one SLA deadline.");
}

function isBusinessDate(parts, normalized) {
  if (normalized.holidays.has(dateKey(parts))) return false;
  const weekday = WEEKDAYS[civilDate(parts).getUTCDay()];
  return normalized.weeklyWindows.some((window) => window.day === weekday);
}

// Preserve the plan rule: same local wall time on the third subsequent
// scheduled business date, not 72 elapsed hours.
export function reopenDeadline(resolvedAt, calendar) {
  const normalized = normalizeCalendarSnapshot(calendar);
  const local = zonedParts(resolvedAt, normalized.timezone);
  const date = civilDate(local);
  let remaining = 3;
  for (let count = 0; count < 3660 && remaining > 0; count += 1) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isBusinessDate(dateParts(date), normalized)) remaining -= 1;
  }
  if (remaining) throw unavailable("No reopening deadline can be calculated.");
  return localDateTimeToInstant({
    ...dateParts(date),
    hour: local.hour,
    minute: local.minute,
    second: local.second,
    millisecond: local.millisecond,
  }, normalized.timezone, "start");
}
