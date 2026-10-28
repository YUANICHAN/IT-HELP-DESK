import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import mongoose from "mongoose";
import { AccessGrant } from "../src/modules/access/accessGrant.model.js";
import { Session } from "../src/modules/auth/session.model.js";
import { WorkerHeartbeat } from "../src/modules/health/workerHeartbeat.model.js";
import { administratorHealth } from "../src/modules/health/health.service.js";
import { performCleanup } from "../src/modules/maintenance/maintenance.service.js";
import { Notification } from "../src/modules/notifications/notification.model.js";
import { enqueueOutboxEvent } from "../src/modules/outbox/outbox.service.js";
import { OutboxEvent } from "../src/modules/outbox/outboxEvent.model.js";
import { Ticket } from "../src/modules/tickets/ticket.model.js";
import { User } from "../src/modules/users/user.model.js";
import { IdempotencyKey } from "../src/shared/database/idempotencyKey.model.js";
import {
  claimNextOutbox,
  deliverInAppClaim,
  processOutboxBatch,
  processOutboxClaim,
  recordOutboxFailure,
  RETRY_DELAYS_MS,
} from "../src/workers/outbox.processor.js";
import { operationsFixture } from "./support/operations.js";

function sourceId() {
  return new mongoose.Types.ObjectId();
}

async function enqueueFor(ticket, user, options = {}) {
  const eventId = options.eventId || sourceId();
  await enqueueOutboxEvent({
    organization: ticket.organization,
    sourceEvent: eventId,
    eventType: options.eventType || "TICKET_PUBLIC_REPLY_ADDED",
    aggregateType: "TICKET",
    aggregateId: ticket._id,
    directRecipients: [{
      userId: user._id,
      accessKind: options.accessKind || "TICKET_PUBLIC",
      visibility: options.visibility || "PUBLIC",
      channel: "IN_APP",
    }],
    metadata: { reference: ticket.reference },
    occurredAt: options.at || new Date("2026-10-28T00:00:00.000Z"),
  });
  return OutboxEvent.findOne({ sourceEvent: eventId }).select("+leaseToken");
}

test("Step 10 background delivery on an isolated replica set", async (context) => {
  const fixture = await operationsFixture("background");
  try {
    const serialized = await fixture.ticket();
    const ticket = await Ticket.findById(serialized.id);
    await OutboxEvent.deleteMany({});
    await Notification.deleteMany({});

    await context.test("deduplication preserves distinct legitimate events", async () => {
      const eventId = sourceId();
      await enqueueFor(ticket, fixture.users.employee, { eventId });
      await enqueueFor(ticket, fixture.users.employee, { eventId });
      assert.equal(await OutboxEvent.countDocuments(), 1);
      await enqueueFor(ticket, fixture.users.employee);
      assert.equal(await OutboxEvent.countDocuments(), 2);
      const summary = await processOutboxBatch({
        workerId: "distinct-events",
        batchSize: 10,
        concurrency: 2,
      });
      assert.equal(summary.delivered, 2);
      assert.equal(await Notification.countDocuments(), 2);
      await OutboxEvent.deleteMany({});
      await Notification.deleteMany({});
    });

    await context.test("competing workers create one in-app notification", async () => {
      const at = new Date("2026-10-28T00:01:00.000Z");
      await enqueueFor(ticket, fixture.users.employee, { at });
      const [first, second] = await Promise.all([
        claimNextOutbox({ workerId: "worker-a", at }),
        claimNextOutbox({ workerId: "worker-b", at }),
      ]);
      const claim = first || second;
      assert.ok(claim);
      assert.equal(Boolean(first) + Boolean(second), 1);
      assert.equal((await processOutboxClaim(claim, at)).outcome, "DELIVERED");
      assert.equal(await Notification.countDocuments(), 1);
      assert.equal((await OutboxEvent.findById(claim._id)).status, "DELIVERED");
      await OutboxEvent.deleteMany({});
      await Notification.deleteMany({});
    });

    await context.test("expired leases recover and stale workers cannot finalize", async () => {
      const at = new Date("2026-10-28T00:02:00.000Z");
      await enqueueFor(ticket, fixture.users.employee, { at });
      const oldClaim = await claimNextOutbox({
        workerId: "crashed-worker",
        at,
        leaseSeconds: 10,
      });
      assert.equal(await claimNextOutbox({
        workerId: "early-worker",
        at: new Date(at.getTime() + 9_000),
        leaseSeconds: 10,
      }), null);
      const recoveredAt = new Date(at.getTime() + 11_000);
      const newClaim = await claimNextOutbox({
        workerId: "recovery-worker",
        at: recoveredAt,
        leaseSeconds: 10,
      });
      assert.ok(newClaim);
      assert.notEqual(oldClaim.leaseToken, newClaim.leaseToken);
      assert.equal(
        (await deliverInAppClaim(oldClaim, recoveredAt)).outcome,
        "LEASE_LOST",
      );
      assert.equal(
        (await deliverInAppClaim(newClaim, recoveredAt)).outcome,
        "DELIVERED",
      );
      assert.equal(await Notification.countDocuments(), 1);
      await OutboxEvent.deleteMany({});
      await Notification.deleteMany({});
    });

    await context.test("notification insertion and outbox completion roll back together", async () => {
      const at = new Date("2026-10-28T00:03:00.000Z");
      await enqueueFor(ticket, fixture.users.employee, { at });
      const claim = await claimNextOutbox({ workerId: "rollback-worker", at });
      const originalUpdate = OutboxEvent.updateOne;
      OutboxEvent.updateOne = function injectedFailure(filter, update, options) {
        if (update?.$set?.status === "DELIVERED") {
          throw new Error("Injected finalization failure");
        }
        return originalUpdate.call(this, filter, update, options);
      };
      try {
        await assert.rejects(() => deliverInAppClaim(claim, at));
      } finally {
        OutboxEvent.updateOne = originalUpdate;
      }
      assert.equal(await Notification.countDocuments(), 0);
      assert.equal((await OutboxEvent.findById(claim._id)).status, "PROCESSING");
      assert.equal((await deliverInAppClaim(claim, at)).outcome, "DELIVERED");
      assert.equal(await Notification.countDocuments(), 1);
      await OutboxEvent.deleteMany({});
      await Notification.deleteMany({});
    });

    await context.test("retry schedule and exhaustion persist across claims", async () => {
      let at = new Date("2026-10-28T00:04:00.000Z");
      await enqueueFor(ticket, fixture.users.employee, { at });
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const claim = await claimNextOutbox({
          workerId: `retry-${attempt}`,
          at,
          leaseSeconds: 60,
        });
        assert.equal(claim.attempts, attempt);
        assert.equal(await recordOutboxFailure(claim, "DATABASE_UNAVAILABLE", at), true);
        const stored = await OutboxEvent.findById(claim._id);
        if (attempt < 5) {
          assert.equal(stored.status, "PENDING");
          assert.equal(
            +stored.nextAttemptAt,
            at.getTime() + RETRY_DELAYS_MS[attempt - 1],
          );
          at = stored.nextAttemptAt;
        } else {
          assert.equal(stored.status, "FAILED");
          assert.equal(stored.lastErrorCode, "DELIVERY_ATTEMPTS_EXHAUSTED");
        }
      }
      await OutboxEvent.deleteMany({});
    });

    await context.test("disabled users and revoked scopes suppress current delivery", async () => {
      const at = new Date("2026-10-28T00:10:00.000Z");
      await enqueueFor(ticket, fixture.users.employee, { at });
      let claim = await claimNextOutbox({ workerId: "disabled", at });
      await User.collection.updateOne(
        { _id: fixture.users.employee._id },
        { $set: { accountStatus: "DISABLED" } },
      );
      assert.equal((await processOutboxClaim(claim, at)).outcome, "SUPPRESSED");
      assert.equal((await OutboxEvent.findById(claim._id)).lastErrorCode, "RECIPIENT_INACTIVE");
      await User.collection.updateOne(
        { _id: fixture.users.employee._id },
        { $set: { accountStatus: "ACTIVE" } },
      );

      await OutboxEvent.deleteMany({});
      await enqueueFor(ticket, fixture.users.triage, {
        at,
        accessKind: "TICKET_INTERNAL",
        visibility: "INTERNAL",
      });
      claim = await claimNextOutbox({ workerId: "revoked", at });
      await AccessGrant.updateOne(
        { _id: fixture.grants["triage:ticket_triage"]._id },
        { $set: { isActive: false, revokedAt: at, revokedBy: fixture.users.admin._id } },
      );
      assert.equal((await processOutboxClaim(claim, at)).outcome, "SUPPRESSED");
      assert.equal((await OutboxEvent.findById(claim._id)).lastErrorCode, "TICKET_ACCESS_REVOKED");
      await AccessGrant.updateOne(
        { _id: fixture.grants["triage:ticket_triage"]._id },
        { $set: { isActive: true }, $unset: { revokedAt: "", revokedBy: "" } },
      );
      await OutboxEvent.deleteMany({});
    });

    await context.test("notification API enforces current ownership, access, CSRF, and safe content", async () => {
      const at = new Date();
      await enqueueFor(ticket, fixture.users.employee, { at });
      const claim = await claimNextOutbox({ workerId: "api-worker", at });
      await processOutboxClaim(claim, at);
      const list = await fixture.request("/notifications", { actor: "employee" });
      assert.equal(list.status, 200, JSON.stringify(list.body));
      assert.equal(list.body.data.notifications.length, 1);
      assert.equal(list.body.data.unreadTotal, 1);
      assert.ok(!JSON.stringify(list.body).includes("Synthetic equipment issue"));
      const notificationId = list.body.data.notifications[0].id;
      assert.equal((await fixture.request(`/notifications/${notificationId}/read`, {
        actor: "peer",
        method: "POST",
        body: {},
      })).status, 404);
      assert.equal((await fixture.request(`/notifications/${notificationId}/read`, {
        actor: "employee",
        method: "POST",
        body: {},
        headers: { "X-CSRF-Token": "invalid" },
      })).status, 403);
      for (let count = 0; count < 2; count += 1) {
        assert.equal((await fixture.request(`/notifications/${notificationId}/read`, {
          actor: "employee",
          method: "POST",
          body: {},
        })).status, 200);
      }
      const after = await fixture.request("/notifications?state=unread", {
        actor: "employee",
      });
      assert.equal(after.body.data.notifications.length, 0);
      assert.equal(after.body.data.unreadTotal, 0);

      await Notification.create({
        organization: fixture.org._id,
        recipient: fixture.users.employee._id,
        outbox: sourceId(),
        eventType: "TICKET_INTERNAL_NOTE_ADDED",
        aggregateType: "TICKET",
        aggregateId: ticket._id,
        accessKind: "TICKET_INTERNAL",
        visibility: "INTERNAL",
        title: "New internal ticket note",
        metadata: {},
        deliveredAt: at,
      });
      const safeList = await fixture.request("/notifications", { actor: "employee" });
      assert.equal(safeList.body.data.notifications.length, 1);
      assert.ok(!JSON.stringify(safeList.body).includes("internal ticket note"));
    });

    await context.test("bounded cleanup removes expirations without business history", async () => {
      const at = new Date();
      const expired = new Date(at.getTime() - 60_000);
      await Session.create({
        organization: fixture.org._id,
        user: fixture.users.peer._id,
        tokenDigest: "a".repeat(64),
        sessionVersion: fixture.users.peer.sessionVersion,
        client: { browser: "Test", operatingSystem: "Test", deviceType: "unknown" },
        lastSeenAt: expired,
        idleExpiresAt: expired,
        absoluteExpiresAt: expired,
      });
      await IdempotencyKey.create({
        organization: fixture.org._id,
        user: fixture.users.peer._id,
        operation: `expired:${randomUUID()}`,
        key: randomUUID(),
        requestDigest: "b".repeat(64),
        resourceType: "TICKET",
        resourceId: ticket._id,
        responseStatus: 200,
        expiresAt: expired,
      });
      const ticketCount = await Ticket.countDocuments();
      const summary = await performCleanup({ at, limit: 50 });
      assert.equal(summary.expiredSessions, 1);
      assert.equal(summary.expiredIdempotencyRecords, 1);
      assert.equal(await Ticket.countDocuments(), ticketCount);
    });

    await context.test("administrator health reports stale workers and failed delivery", async () => {
      const at = new Date();
      await WorkerHeartbeat.create({
        workerId: `stale-${randomUUID()}`,
        startedAt: new Date(at.getTime() - 120_000),
        lastSeenAt: new Date(at.getTime() - 120_000),
        status: "RUNNING",
        release: "test-release",
      });
      const failed = await enqueueFor(ticket, fixture.users.employee, { at });
      await OutboxEvent.updateOne(
        { _id: failed._id },
        { $set: { status: "FAILED", lastErrorCode: "DELIVERY_ATTEMPTS_EXHAUSTED" } },
      );
      const health = await administratorHealth(fixture.org._id);
      assert.equal(health.status, "degraded");
      assert.equal(health.worker.fresh, false);
      assert.equal(health.outbox.failed, 1);
      assert.equal(health.outbox.failureSummary[0].code, "DELIVERY_ATTEMPTS_EXHAUSTED");
      const response = await fixture.request("/admin/health", { actor: "admin" });
      assert.equal(response.status, 200);
      assert.equal((await fixture.request("/admin/health", { actor: "employee" })).status, 403);
    });
  } finally {
    await fixture.close();
  }
});
