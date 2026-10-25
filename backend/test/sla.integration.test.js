import assert from "node:assert/strict";
import test from "node:test";
import { AccessGrant } from "../src/modules/access/accessGrant.model.js";
import { AuthenticationAudit } from "../src/modules/auth/authenticationAudit.model.js";
import { OutboxEvent } from "../src/modules/outbox/outboxEvent.model.js";
import { DEFAULT_WEEKLY_WINDOWS } from "../src/modules/service-levels/businessTime.js";
import { SlaBreach } from "../src/modules/service-levels/slaBreach.model.js";
import { SlaCycle } from "../src/modules/service-levels/slaCycle.model.js";
import { SlaPause } from "../src/modules/service-levels/slaPause.model.js";
import { TicketEvent } from "../src/modules/tickets/ticketEvent.model.js";
import { Ticket } from "../src/modules/tickets/ticket.model.js";
import {
  resetClockForTests,
  setClockForTests,
} from "../src/shared/time/clock.js";
import {
  evaluateSlaBreaches,
  evaluateSlaCycle,
} from "../src/workers/sla.processor.js";
import { operationsFixture } from "./support/operations.js";

function useTime(iso) {
  const value = new Date(iso);
  setClockForTests(() => new Date(value));
  return value;
}

function expectStatus(response, expected) {
  assert.equal(response.status, expected, JSON.stringify(response.body));
  return response.body?.data;
}

test("Step 9 SLA lifecycle on an isolated replica set", async (context) => {
  const fixture = await operationsFixture("sla");
  try {
    await context.test("worker recovery is boundary-correct, concurrent, and retry-safe", async () => {
      useTime("2026-10-19T00:00:00.000Z"); // Monday 08:00 Asia/Manila
      const ticket = await fixture.ticket();
      const cycle = await SlaCycle.findOne({ ticket: ticket.id });
      assert.equal(cycle.responseBudgetSeconds, 1800);
      assert.equal(cycle.resolutionBudgetSeconds, 14400);

      const requesterView = expectStatus(
        await fixture.request(`/tickets/${ticket.id}/service-level`),
        200,
      ).serviceLevel;
      assert.equal(requesterView.viewer, "REQUESTER");
      assert.equal(requesterView.units, "seconds");
      assert.equal(requesterView.currentCycle.response.dueAt, "2026-10-19T00:30:00.000Z");
      assert.equal(Object.hasOwn(requesterView, "cycles"), false);
      expectStatus(
        await fixture.request(`/tickets/${ticket.id}/service-level`, { actor: "admin" }),
        404,
      );
      const supervisorView = expectStatus(
        await fixture.request(`/tickets/${ticket.id}/service-level`, { actor: "supervisor" }),
        200,
      ).serviceLevel;
      assert.equal(supervisorView.viewer, "SUPERVISOR_PUBLIC");
      assert.equal(Object.hasOwn(supervisorView, "pauses"), false);

      await evaluateSlaCycle(cycle._id, new Date("2026-10-19T00:30:00.000Z"));
      assert.equal(await SlaBreach.countDocuments({ ticket: ticket.id }), 0);

      const lateResponse = new Date("2026-10-19T00:30:00.001Z");
      await Promise.all(
        Array.from({ length: 4 }, () => evaluateSlaCycle(cycle._id, lateResponse)),
      );
      assert.equal(
        await SlaBreach.countDocuments({ ticket: ticket.id, metric: "RESPONSE" }),
        1,
      );
      assert.equal(
        await TicketEvent.countDocuments({ ticket: ticket.id, type: "SLA_RESPONSE_BREACHED" }),
        1,
      );
      assert.equal(
        await AuthenticationAudit.countDocuments({
          ticket: ticket.id,
          eventType: "TICKET_SLA_RESPONSE_BREACHED",
        }),
        1,
      );
      assert.equal(
        await OutboxEvent.countDocuments({
          aggregateId: ticket.id,
          eventType: "TICKET_SLA_RESPONSE_BREACHED",
          status: "PENDING",
        }),
        1,
      );

      await evaluateSlaCycle(cycle._id, new Date("2026-10-19T04:00:00.000Z"));
      assert.equal(
        await SlaBreach.countDocuments({ ticket: ticket.id, metric: "RESOLUTION" }),
        0,
      );
      const recovered = await evaluateSlaBreaches({
        at: new Date("2026-10-19T04:00:00.001Z"),
      });
      assert.ok(recovered.evaluated >= 1);
      assert.equal(
        await SlaBreach.countDocuments({ ticket: ticket.id, metric: "RESOLUTION" }),
        1,
      );

      const staffView = expectStatus(
        await fixture.request(`/tickets/${ticket.id}/service-level`, { actor: "tech" }),
        200,
      ).serviceLevel;
      assert.equal(staffView.viewer, "STAFF");
      assert.equal(staffView.breaches.length, 2);
      const requesterAfter = expectStatus(
        await fixture.request(`/tickets/${ticket.id}/service-level`),
        200,
      ).serviceLevel;
      assert.equal(requesterAfter.currentCycle.response.historicalBreach, true);
      assert.equal(Object.hasOwn(requesterAfter, "breaches"), false);

      await AccessGrant.updateOne(
        { _id: fixture.grants["tech:support"]._id },
        { $set: { isActive: false, revokedAt: new Date() } },
      );
      expectStatus(
        await fixture.request(`/tickets/${ticket.id}/service-level`, { actor: "tech" }),
        404,
      );
      await AccessGrant.updateOne(
        { _id: fixture.grants["tech:support"]._id },
        { $set: { isActive: true }, $unset: { revokedAt: 1, revokedBy: 1 } },
      );
    });

    await context.test("breach artifacts and notifications roll back together", async () => {
      useTime("2026-10-20T00:00:00.000Z");
      const ticket = await fixture.ticket();
      const cycle = await SlaCycle.findOne({ ticket: ticket.id });
      const originalCreate = OutboxEvent.create;
      OutboxEvent.create = async function failSlaOutbox(documents, options) {
        if (documents?.[0]?.eventType?.startsWith("TICKET_SLA_")) {
          throw new Error("Injected SLA outbox failure");
        }
        return originalCreate.call(this, documents, options);
      };
      try {
        await assert.rejects(
          evaluateSlaCycle(cycle._id, new Date("2026-10-20T00:31:00.000Z")),
          /Injected SLA outbox failure/u,
        );
      } finally {
        OutboxEvent.create = originalCreate;
      }
      assert.equal(await SlaBreach.countDocuments({ ticket: ticket.id }), 0);
      assert.equal(
        await TicketEvent.countDocuments({ ticket: ticket.id, type: "SLA_RESPONSE_BREACHED" }),
        0,
      );
      assert.equal(
        await AuthenticationAudit.countDocuments({
          ticket: ticket.id,
          eventType: "TICKET_SLA_RESPONSE_BREACHED",
        }),
        0,
      );
      await evaluateSlaCycle(cycle._id, new Date("2026-10-20T00:31:00.000Z"));
      assert.equal(await SlaBreach.countDocuments({ ticket: ticket.id }), 1);
      assert.equal(
        await OutboxEvent.countDocuments({
          aggregateId: ticket.id,
          eventType: "TICKET_SLA_RESPONSE_BREACHED",
        }),
        1,
      );
    });

    await context.test("snapshots, requester pauses, vendor waits, priority changes, and reopen cycles stay coherent", async () => {
      const oldCycle = await SlaCycle.findOne({}).sort({ createdAt: 1 }).lean();
      assert.equal(oldCycle.configurationSnapshots.businessCalendar.revision, 1);
      assert.equal(oldCycle.responseBudgetSeconds, 1800);

      fixture.calendar.weeklyWindows = DEFAULT_WEEKLY_WINDOWS.map((window) => ({ ...window }));
      fixture.calendar.revision = 2;
      await fixture.calendar.save();
      fixture.policy.targets = {
        P1: { responseSeconds: 900, resolutionSeconds: 3600 },
        P2: { responseSeconds: 3600, resolutionSeconds: 18000 },
      };
      fixture.policy.revision = 2;
      await fixture.policy.save();

      useTime("2026-10-19T03:30:00.000Z"); // Monday 11:30
      const requesterWait = await fixture.ticket();
      const newCycle = await SlaCycle.findOne({ ticket: requesterWait.id });
      assert.equal(newCycle.configurationSnapshots.businessCalendar.revision, 2);
      assert.equal(newCycle.configurationSnapshots.slaPolicy.revision, 2);
      assert.equal(newCycle.responseBudgetSeconds, 3600);
      const oldCycleAgain = await SlaCycle.findById(oldCycle._id).lean();
      assert.equal(oldCycleAgain.configurationSnapshots.businessCalendar.revision, 1);
      assert.equal(oldCycleAgain.responseBudgetSeconds, 1800);

      expectStatus(await fixture.command(requesterWait.id, "claim", "tech"), 200);
      expectStatus(await fixture.command(requesterWait.id, "start", "tech"), 200);
      useTime("2026-10-19T03:45:00.000Z"); // 11:45
      expectStatus(await fixture.command(requesterWait.id, "wait", "tech", {
        status: "WAITING_REQUESTER",
        reason: "Requester confirmation is required",
        nextStep: "Please confirm the cable indicator status.",
      }), 200);
      useTime("2026-10-19T05:15:00.000Z"); // 13:15
      const paused = expectStatus(
        await fixture.request(`/tickets/${requesterWait.id}/service-level`),
        200,
      ).serviceLevel.currentCycle;
      assert.equal(paused.pause.isPaused, true);
      assert.equal(paused.response.elapsedBusinessSeconds, 900);
      assert.equal(paused.resolution.elapsedBusinessSeconds, 900);
      assert.equal(paused.resolution.pausedBusinessSeconds, 1800);
      assert.equal(paused.resolution.dueAt, null);
      assert.equal(paused.resolution.dueAtAuthoritative, false);

      expectStatus(await fixture.post(`/tickets/${requesterWait.id}/comments`, "employee", {
        expectedVersion: (await Ticket.findById(requesterWait.id)).version,
        body: "The cable indicator is now green.",
        visibility: "PUBLIC",
      }), 201);
      useTime("2026-10-19T06:00:00.000Z"); // 14:00
      const resumed = expectStatus(
        await fixture.request(`/tickets/${requesterWait.id}/service-level`, { actor: "tech" }),
        200,
      ).serviceLevel;
      assert.equal(resumed.currentCycle.pause.isPaused, false);
      assert.equal(resumed.currentCycle.resolution.elapsedBusinessSeconds, 3600);
      assert.equal(resumed.currentCycle.resolution.pausedBusinessSeconds, 1800);
      assert.equal(resumed.pauses[0].endReason, "REQUESTER_REPLIED");

      useTime("2026-10-20T00:00:00.000Z");
      const vendorWait = await fixture.ticket();
      expectStatus(await fixture.command(vendorWait.id, "claim", "tech"), 200);
      expectStatus(await fixture.command(vendorWait.id, "start", "tech"), 200);
      useTime("2026-10-20T00:15:00.000Z");
      expectStatus(await fixture.command(vendorWait.id, "wait", "tech", {
        status: "WAITING_VENDOR",
        reason: "Vendor diagnostic is pending",
        nextStep: "The vendor is reviewing the diagnostic bundle.",
      }), 200);
      useTime("2026-10-20T01:15:00.000Z");
      const vendorLevel = expectStatus(
        await fixture.request(`/tickets/${vendorWait.id}/service-level`, { actor: "tech" }),
        200,
      ).serviceLevel;
      assert.equal(vendorLevel.currentCycle.resolution.elapsedBusinessSeconds, 4500);
      assert.equal(
        await SlaPause.countDocuments({ ticket: vendorWait.id }),
        0,
      );

      useTime("2026-10-21T00:00:00.000Z");
      const priorityTicket = await fixture.ticket();
      useTime("2026-10-21T00:20:00.000Z");
      expectStatus(await fixture.command(priorityTicket.id, "triage", "triage", {
        category: "OTHER",
        impact: "HIGH",
        urgency: "HIGH",
        priority: "P1",
        reason: "Critical business impact confirmed",
      }), 200);
      let priorityCycle = await SlaCycle.findOne({ ticket: priorityTicket.id });
      assert.equal(priorityCycle.priority, "P1");
      assert.equal(priorityCycle.responseBudgetSeconds, 900);
      assert.equal(priorityCycle.priorityChanges.length, 1);
      assert.equal(
        await SlaBreach.countDocuments({ ticket: priorityTicket.id, metric: "RESPONSE" }),
        1,
      );
      expectStatus(await fixture.command(priorityTicket.id, "claim", "tech"), 200);
      expectStatus(await fixture.post(`/tickets/${priorityTicket.id}/comments`, "tech", {
        expectedVersion: (await Ticket.findById(priorityTicket.id)).version,
        body: "We have started investigating the critical impact.",
        visibility: "PUBLIC",
      }), 201);
      useTime("2026-10-21T00:25:00.000Z");
      expectStatus(await fixture.command(priorityTicket.id, "triage", "triage", {
        category: "OTHER",
        impact: "MEDIUM",
        urgency: "HIGH",
        priority: "P2",
        reason: "Impact was reduced after containment",
      }), 200);
      priorityCycle = await SlaCycle.findOne({ ticket: priorityTicket.id });
      assert.equal(priorityCycle.priority, "P2");
      assert.equal(priorityCycle.responseBudgetAtCompletionSeconds, 900);
      assert.equal(priorityCycle.responseBudgetSeconds, 900);
      assert.equal(priorityCycle.priorityChanges.length, 2);
      assert.equal(
        await SlaBreach.countDocuments({ ticket: priorityTicket.id, metric: "RESPONSE" }),
        1,
      );

      useTime("2026-10-19T06:00:00.000Z");
      expectStatus(await fixture.command(requesterWait.id, "resolve", "tech", {
        summary: "The cable was reseated and connectivity was restored.",
        resolutionCode: "FIXED",
      }), 200);
      useTime("2026-10-20T06:00:00.000Z");
      expectStatus(await fixture.command(requesterWait.id, "reopen", "employee", {
        reason: "The same cable fault returned.",
        sameIssue: true,
      }), 200);
      const cycles = await SlaCycle.find({ ticket: requesterWait.id })
        .sort({ cycleNumber: 1 })
        .lean();
      assert.equal(cycles.length, 2);
      assert.equal(cycles[0].isOpen, false);
      assert.equal(cycles[0].endReason, "RESOLVED");
      assert.equal(cycles[1].isOpen, true);
      assert.deepEqual(cycles[1].configurationSnapshots, cycles[0].configurationSnapshots);
      assert.equal(cycles[1].originalSubmittedAt.toISOString(), cycles[0].originalSubmittedAt.toISOString());

      assert.equal((await Ticket.findById(requesterWait.id)).slaCycleNumber, 2);
    });
  } finally {
    resetClockForTests();
    await fixture.close();
  }
});
