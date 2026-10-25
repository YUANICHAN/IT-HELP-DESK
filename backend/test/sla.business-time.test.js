import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WEEKLY_WINDOWS,
  addBusinessMilliseconds,
  addBusinessMillisecondsWithPauses,
  businessMilliseconds,
  reopenDeadline,
} from "../src/modules/service-levels/businessTime.js";
import {
  clockNow,
  resetClockForTests,
  setClockForTests,
} from "../src/shared/time/clock.js";

function manila(holidays = []) {
  return {
    timezone: "Asia/Manila",
    weeklyWindows: DEFAULT_WEEKLY_WINDOWS.map((window) => ({ ...window })),
    holidays,
  };
}

test("deterministic Manila SLA acceptance examples", () => {
  const friday1645 = new Date("2026-10-23T08:45:00.000Z");
  assert.equal(
    addBusinessMilliseconds(friday1645, 30 * 60 * 1000, manila()).toISOString(),
    "2026-10-26T00:15:00.000Z",
  );
  assert.equal(
    addBusinessMilliseconds(friday1645, 4 * 60 * 60 * 1000, manila()).toISOString(),
    "2026-10-26T03:45:00.000Z",
  );
  const holidayCalendar = manila([{ date: "2026-10-26", name: "Fixture holiday" }]);
  assert.equal(
    addBusinessMilliseconds(friday1645, 30 * 60 * 1000, holidayCalendar).toISOString(),
    "2026-10-27T00:15:00.000Z",
  );
  assert.equal(
    addBusinessMilliseconds(friday1645, 4 * 60 * 60 * 1000, holidayCalendar).toISOString(),
    "2026-10-27T03:45:00.000Z",
  );
  assert.equal(
    addBusinessMilliseconds(
      new Date("2026-10-19T03:45:00.000Z"),
      30 * 60 * 1000,
      manila(),
    ).toISOString(),
    "2026-10-19T05:15:00.000Z",
  );
  assert.equal(
    addBusinessMillisecondsWithPauses(
      new Date("2026-10-19T03:30:00.000Z"),
      60 * 60 * 1000,
      manila(),
      [{
        startedAt: new Date("2026-10-19T03:45:00.000Z"),
        endedAt: new Date("2026-10-19T05:15:00.000Z"),
      }],
    ).toISOString(),
    "2026-10-19T06:00:00.000Z",
  );
});

test("boundaries, weekends, consecutive holidays, and timezone dates are exact", () => {
  const calendar = manila([{ date: "2026-10-26" }, { date: "2026-10-27" }]);
  assert.equal(
    businessMilliseconds(
      new Date("2026-10-19T00:00:00.000Z"),
      new Date("2026-10-19T04:00:00.000Z"),
      manila(),
    ),
    4 * 60 * 60 * 1000,
  );
  assert.equal(
    businessMilliseconds(
      new Date("2026-10-19T04:00:00.000Z"),
      new Date("2026-10-19T05:00:00.000Z"),
      manila(),
    ),
    0,
  );
  assert.equal(
    addBusinessMilliseconds(
      new Date("2026-10-23T09:00:00.000Z"),
      1,
      calendar,
    ).toISOString(),
    "2026-10-28T00:00:00.001Z",
  );
  assert.equal(
    businessMilliseconds(
      new Date("2026-10-18T16:00:00.000Z"),
      new Date("2026-10-19T00:00:00.000Z"),
      manila(),
    ),
    0,
  );
});

test("DST gaps and overlaps use documented actual-instant behavior", () => {
  const spring = {
    timezone: "America/New_York",
    weeklyWindows: [{ day: "SUNDAY", start: "01:00", end: "04:00" }],
    holidays: [],
  };
  assert.equal(
    businessMilliseconds(
      new Date("2026-03-08T06:00:00.000Z"),
      new Date("2026-03-08T08:00:00.000Z"),
      spring,
    ),
    2 * 60 * 60 * 1000,
  );
  const fall = {
    timezone: "America/New_York",
    weeklyWindows: [{ day: "SUNDAY", start: "01:00", end: "02:00" }],
    holidays: [],
  };
  assert.equal(
    businessMilliseconds(
      new Date("2026-11-01T05:00:00.000Z"),
      new Date("2026-11-01T07:00:00.000Z"),
      fall,
    ),
    2 * 60 * 60 * 1000,
  );
  assert.equal(
    reopenDeadline(new Date("2026-03-06T15:00:00.000Z"), {
      timezone: "America/New_York",
      weeklyWindows: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]
        .map((day) => ({ day, start: "08:00", end: "17:00" })),
      holidays: [],
    }).toISOString(),
    "2026-03-11T14:00:00.000Z",
  );
});

test("server clock can be injected internally for deterministic tests", () => {
  setClockForTests(() => new Date("2026-10-23T08:45:00.000Z"));
  try {
    assert.equal(clockNow().toISOString(), "2026-10-23T08:45:00.000Z");
  } finally {
    resetClockForTests();
  }
});
