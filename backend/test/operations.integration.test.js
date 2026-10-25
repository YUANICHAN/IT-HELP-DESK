import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { utimes } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import mongoose from "mongoose";
import { operationsFixture, PNG } from "./support/operations.js";
import { Ticket } from "../src/modules/tickets/ticket.model.js";
import { TicketEvent } from "../src/modules/tickets/ticketEvent.model.js";
import { TicketComment } from "../src/modules/tickets/ticketComment.model.js";
import { TicketWorklog } from "../src/modules/tickets/ticketWorklog.model.js";
import { SlaPause } from "../src/modules/service-levels/slaPause.model.js";
import { SlaCycle } from "../src/modules/service-levels/slaCycle.model.js";
import { Asset } from "../src/modules/assets/asset.model.js";
import { AssetAssignment } from "../src/modules/assets/assetAssignment.model.js";
import { AssetEvent } from "../src/modules/assets/assetEvent.model.js";
import { Attachment } from "../src/modules/attachments/attachment.model.js";
import { OutboxEvent } from "../src/modules/outbox/outboxEvent.model.js";
import { AuthenticationAudit } from "../src/modules/auth/authenticationAudit.model.js";
import { AccessGrant } from "../src/modules/access/accessGrant.model.js";
import { User } from "../src/modules/users/user.model.js";
import { ServiceItem } from "../src/modules/catalog/serviceItem.model.js";
import { localStorage } from "../src/adapters/storage/localStorage.adapter.js";
import { cleanupAttachments } from "../src/modules/attachments/attachment.service.js";
import { reopenDeadline } from "../src/modules/service-levels/businessTime.js";
import { IdempotencyKey } from "../src/shared/database/idempotencyKey.model.js";
import { Session } from "../src/modules/auth/session.model.js";
import { createIndexes } from "../scripts/create-indexes.js";
import { cycleElapsed } from "../src/modules/service-levels/slaClock.service.js";
function status(response, expected) {
  assert.equal(response.status, expected, JSON.stringify(response.body));
  return response.body?.data;
}
test("Steps 6 and 7 replica-set operations", async context => {
  const f = await operationsFixture("operations");
  try {
    await context.test("triage matrix, protected PATCH, reasons, original department and snapshots", async () => {
      const t = await f.ticket(),
        before = await Ticket.findById(t.id).lean();
      status(await f.command(t.id, "triage", "tech", {
        category: "HARDWARE",
        impact: "HIGH"
      }), 403);
      status(await f.command(t.id, "triage", "triage", {
        category: "NOT_A_CATEGORY",
        impact: "HIGH"
      }), 422);
      status(await f.command(t.id, "triage", "triage", {
        category: "HARDWARE",
        impact: "HIGH",
        priority: "P4"
      }), 400);
      const triaged = status(await f.command(t.id, "triage", "triage", {
        category: "HARDWARE",
        impact: "HIGH"
      }), 200).ticket;
      assert.equal(triaged.priority, "P1");
      assert.equal(triaged.status, "OPEN");
      status(await f.request(`/tickets/${t.id}`, {
        method: "PATCH",
        body: {
          expectedVersion: triaged.version,
          priority: "P4"
        },
        key: randomUUID()
      }), 400);
      status(await f.request(`/tickets/${t.id}`, {
        method: "PATCH",
        body: {
          expectedVersion: triaged.version,
          title: "Changed descriptive title"
        },
        key: randomUUID()
      }), 200);
      const after = await Ticket.findById(t.id).lean();
      assert.deepEqual(after.configurationSnapshots, before.configurationSnapshots);
      assert.equal(String(after.requesterDepartment), String(before.requesterDepartment));
      status(await f.request(`/tickets/${t.id}`, {
        method: "PATCH",
        actor: "triage",
        body: {
          expectedVersion: after.version,
          title: "Triage edit needs a reason"
        },
        key: randomUUID()
      }), 400);
      status(await f.command(t.id, "assignment", "triage", {
        assigneeId: f.users.other.id,
        reason: "Wrong role"
      }), 422);
      status(await f.command(t.id, "assignment", "tech", {
        assigneeId: f.users.tech.id,
        reason: "Not permitted"
      }), 403);
      status(await f.command(t.id, "assignment", "triage", {
        assigneeId: f.users.tech.id,
        reason: "Dispatch"
      }), 200);
      status(await f.command(t.id, "start", "tech"), 200);
      status(await f.request(`/tickets/${t.id}`, {
        method: "PATCH",
        body: {
          expectedVersion: (await Ticket.findById(t.id)).version,
          description: "Requester cannot rewrite started work details."
        },
        key: randomUUID()
      }), 403);
    });
    await context.test("internal discussion, worklog privacy, staff requester relationship and first response", async () => {
      const t = await f.ticket();
      status(await f.command(t.id, "claim", "tech"), 200);
      status(await f.command(t.id, "start", "tech"), 200);
      const secret = "private staff diagnostic secret";
      status(await f.command(t.id, "comment", "tech", {
        body: secret,
        visibility: "INTERNAL"
      }), 404); // No singular comment endpoint.
      const note = status(await f.command(t.id, "comments", "tech", {
        body: secret,
        visibility: "INTERNAL"
      }), 201).comment;
      assert.equal((await Ticket.findById(t.id)).firstResponseAt, undefined);
      status(await f.command(t.id, "worklogs", "tech", {
        start: "2026-10-20T01:00:00Z",
        end: "2026-10-20T01:30:00Z",
        notes: secret
      }), 201);
      assert.equal((await TicketWorklog.findOne({
        ticket: t.id
      })).durationSeconds, 1800);
      status(await f.command(t.id, "worklogs", "tech", {
        start: "2026-10-20T01:00:00Z",
        end: "2026-10-20T00:30:00Z",
        notes: "Invalid duration"
      }), 400);
      status(await f.command(t.id, "comments", "employee", {
        body: "Internal spoof",
        visibility: "INTERNAL"
      }), 404);
      status(await f.command(t.id, "comments", "supervisor", {
        body: "Supervisor cannot see internal content",
        visibility: "INTERNAL"
      }), 404);
      for (const actor of ["employee", "supervisor"]) {
        const comments = status(await f.request(`/tickets/${t.id}/comments?limit=1`, {
          actor
        }), 200);
        assert.equal(comments.pagination.total, 0);
        const events = status(await f.request(`/tickets/${t.id}/events`, {
          actor
        }), 200);
        assert.equal(events.pagination.total, 3);
        assert.equal(JSON.stringify(events).includes(secret), false);
        status(await f.request(`/tickets/${t.id}/worklogs`, {
          actor
        }), 404);
      }
      const internal = status(await f.request(`/tickets/${t.id}/comments?limit=1`, {
        actor: "triage"
      }), 200);
      assert.equal(internal.comments[0].id, note.id);
      const outbox = await OutboxEvent.find({
        aggregateId: t.id
      }).lean();
      assert.equal(JSON.stringify(outbox).includes(secret), false);
      const ownStaff = await f.ticket("tech");
      status(await f.command(ownStaff.id, "assignment", "triage", {
        assigneeId: f.users.tech2.id,
        reason: "Assign another technician"
      }), 200);
      status(await f.command(ownStaff.id, "comments", "tech2", {
        body: secret,
        visibility: "INTERNAL"
      }), 201);
      const staffRequesterComments = status(await f.request(`/tickets/${ownStaff.id}/comments`, {
        actor: "tech"
      }), 200);
      assert.equal(staffRequesterComments.pagination.total, 0);
      status(await f.command(t.id, "comments", "supervisor", {
        body: "Public department context"
      }), 201);
      assert.equal((await Ticket.findById(t.id)).firstResponseAt, undefined);
    });
    await context.test("waiting replies, pauses, reassignment, revoked assignee, manual vendor updates", async () => {
      const t = await f.ticket();
      const original = await SlaCycle.findOne({
        ticket: t.id
      }).lean();
      status(await f.command(t.id, "claim", "tech"), 200);
      status(await f.command(t.id, "start", "tech"), 200);
      status(await f.command(t.id, "wait", "tech", {
        status: "WAITING_REQUESTER",
        reason: "Internal wait reason",
        nextStep: "Please send a sample."
      }), 200);
      assert.equal(await SlaPause.countDocuments({
        ticket: t.id,
        endedAt: null,
        clock: "RESOLUTION"
      }), 1);
      status(await f.command(t.id, "assignment", "triage", {
        assigneeId: f.users.tech2.id,
        reason: "Reassign while waiting"
      }), 200);
      assert.equal((await Ticket.findById(t.id)).status, "WAITING_REQUESTER");
      status(await f.command(t.id, "comments", "employee", {
        body: "Here is the sample."
      }), 201);
      assert.equal((await Ticket.findById(t.id)).status, "IN_PROGRESS");
      assert.equal(await SlaPause.countDocuments({
        ticket: t.id,
        endedAt: null
      }), 0);
      status(await f.command(t.id, "wait", "tech2", {
        status: "WAITING_VENDOR",
        reason: "Vendor dependency",
        nextStep: "We are waiting for vendor confirmation."
      }), 200);
      assert.equal(await SlaPause.countDocuments({
        ticket: t.id,
        endedAt: null
      }), 0);
      status(await f.command(t.id, "comments", "employee", {
        body: "Requester reply cannot resume vendor wait."
      }), 201);
      assert.equal((await Ticket.findById(t.id)).status, "WAITING_VENDOR");
      status(await f.command(t.id, "resume", "tech2"), 400);
      status(await f.command(t.id, "resume", "tech2", {
        dependencyUpdate: "The vendor restored service."
      }), 200);
      status(await f.command(t.id, "wait", "tech2", {
        status: "WAITING_REQUESTER",
        reason: "Need confirmation",
        nextStep: "Please retest."
      }), 200);
      await AccessGrant.updateOne({
        _id: f.grants["tech2:support"]._id
      }, {
        $set: {
          isActive: false,
          revokedAt: new Date()
        }
      });
      status(await f.request(`/tickets/${t.id}`, {
        actor: "tech2"
      }), 404);
      status(await f.command(t.id, "comments", "employee", {
        body: "I retested after the grant was revoked."
      }), 201);
      const reopened = await Ticket.findById(t.id);
      assert.equal(reopened.status, "OPEN");
      assert.equal(reopened.assignee, null);
      f.grants["tech2:support"] = await AccessGrant.create({
        organization: f.org._id,
        user: f.users.tech2._id,
        capability: "support",
        department: f.dept._id,
        grantedBy: f.users.admin._id
      });
      status(await f.command(t.id, "assignment", "triage", {
        assigneeId: f.users.tech.id,
        reason: "Assign again"
      }), 200);
      status(await f.command(t.id, "start", "tech"), 200);
      status(await f.command(t.id, "wait", "tech", {
        status: "WAITING_REQUESTER",
        reason: "Await reply",
        nextStep: "Reply when ready."
      }), 200);
      status(await f.command(t.id, "resume", "tech"), 200);
      status(await f.command(t.id, "assignment", "triage", {
        assigneeId: null,
        reason: "Remove assignee"
      }), 200);
      assert.equal((await Ticket.findById(t.id)).status, "OPEN");
      const cycle = await SlaCycle.findOne({
        ticket: t.id
      }).lean();
      assert.deepEqual(cycle.startedAt, original.startedAt);
      assert.deepEqual(cycle.configurationSnapshots, original.configurationSnapshots);
    });
    await context.test("cancellation races, terminal states, malformed imported approval stays blocked, reopening cycles", async () => {
      const t = await f.ticket();
      status(await f.command(t.id, "claim", "tech"), 200);
      const outcomes = await Promise.all([f.post(`/tickets/${t.id}/start`, "tech", {
        expectedVersion: 1
      }), f.post(`/tickets/${t.id}/cancel`, "employee", {
        expectedVersion: 1,
        reason: "No longer needed"
      })]);
      assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 409]);
      if ((await Ticket.findById(t.id)).status !== "CANCELLED") {
        status(await f.command(t.id, "cancel", "employee", {
          reason: "Work already started"
        }), 403);
        status(await f.command(t.id, "worklogs", "tech", {
          start: "2026-10-20T01:00:00Z",
          end: "2026-10-20T02:00:00Z",
          notes: "Completed work survives cancellation"
        }), 201);
        status(await f.command(t.id, "cancel", "triage", {
          reason: "Cancel by supervisor"
        }), 200);
        assert.equal(await TicketWorklog.countDocuments({
          ticket: t.id
        }), 1);
      }
      for (const action of ["start", "reopen", "cancel"]) status(await f.command(t.id, action, "triage", {
        ...(action !== "start" ? {
          reason: "Terminal protection",
          sameIssue: action === "reopen" ? true : undefined
        } : {})
      }), 409);
      const pending = await f.ticket();
      await Ticket.collection.updateOne({
        _id: new mongoose.Types.ObjectId(pending.id)
      }, {
        $set: {
          status: "WAITING_APPROVAL",
          approvalStatus: "PENDING",
          approvalRequired: true
        }
      });
      status(await f.command(pending.id, "cancel", "employee", {
        reason: "Pending approval must not be bypassed"
      }), 409);
      assert.equal((await Ticket.findById(pending.id)).status, "WAITING_APPROVAL");
      const resolved = await f.ticket();
      status(await f.command(resolved.id, "claim", "tech"), 200);
      status(await f.command(resolved.id, "start", "tech"), 200);
      status(await f.command(resolved.id, "resolve", "tech", {
        summary: "Resolved the original issue",
        resolutionCode: "FIXED"
      }), 200);
      const cycle1 = await SlaCycle.findOne({
        ticket: resolved.id
      }).lean();
      status(await f.command(resolved.id, "close", "triage"), 400);
      status(await f.command(resolved.id, "reopen", "employee", {
        reason: "Same problem recurred",
        sameIssue: true
      }), 200);
      assert.equal(await SlaCycle.countDocuments({
        ticket: resolved.id
      }), 2);
      assert.deepEqual(await SlaCycle.findById(cycle1._id).lean(), cycle1);
      status(await f.command(resolved.id, "start", "tech"), 200);
      status(await f.command(resolved.id, "resolve", "tech", {
        summary: "Second resolution",
        resolutionCode: "FIXED"
      }), 200);
      assert.ok((await SlaCycle.findOne({
        ticket: resolved.id,
        cycleNumber: 2
      })).endedAt);
      status(await f.command(resolved.id, "close", "triage", {
        confirmationEvidence: "Requester confirmed by phone at 10:00"
      }), 200);
      status(await f.command(resolved.id, "reopen", "employee", {
        reason: "Closed is terminal",
        sameIssue: true
      }), 409);
      const follow = await f.ticket("employee", {
        followUpOfId: resolved.id
      });
      assert.equal(follow.followUpOf, resolved.id);
      const unrelated = await f.ticket("other");
      status(await f.post("/tickets", "employee", {
        serviceItemId: f.service.id,
        title: "Unauthorized linked follow up",
        description: "Attempt to link someone else's inaccessible issue",
        urgency: "LOW",
        followUpOfId: unrelated.id
      }), 404);
    });
    await context.test("protected attachment privacy, signatures, traversal names, parent checks and limits", async () => {
      const t = await f.ticket();
      status(await f.command(t.id, "claim", "tech"), 200);
      const note = status(await f.command(t.id, "comments", "tech", {
        body: "Private attachment parent",
        visibility: "INTERNAL"
      }), 201).comment;
      status(await f.upload(t.id, {
        actor: "tech",
        commentId: note.id,
        visibility: "PUBLIC"
      }), 400);
      const file = status(await f.upload(t.id, {
        actor: "tech",
        commentId: note.id,
        visibility: "INTERNAL",
        filename: "../../private-secret.png"
      }), 201).attachment;
      assert.equal(file.state, "READY");
      assert.equal(file.scanStatus, "NOT_CONFIGURED");
      assert.equal(file.filename, "private-secret.png");
      for (const actor of ["employee", "supervisor", "admin"]) {
        status(await f.request(`/attachments/${file.id}`, {
          actor
        }), 404);
        status(await f.request(`/attachments/${file.id}/download`, {
          actor
        }), 404);
      }
      const employeeFiles = status(await f.request(`/tickets/${t.id}/attachments`), 200);
      assert.equal(employeeFiles.pagination.total, 0);
      const downloaded = await f.request(`/attachments/${file.id}/download`, {
        actor: "tech",
        raw: true
      });
      assert.equal(downloaded.status, 200);
      assert.deepEqual(downloaded.body, PNG);
      assert.equal(downloaded.headers.get("x-content-type-options"), "nosniff");
      assert.match(downloaded.headers.get("content-disposition"), /^attachment;/u);
      assert.equal(JSON.stringify(status(await f.request(`/attachments/${file.id}`, {
        actor: "tech"
      }), 200)).includes("storageName"), false);
      status(await f.upload(t.id, {
        buffer: Buffer.from("spoofed file")
      }), 415);
      status(await f.upload(t.id, {
        filename: "image.pdf"
      }), 415);
      status(await f.upload(t.id, {
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1)
      }), 413);
      const other = await f.ticket(),
        otherComment = status(await f.command(other.id, "comments", "employee", {
          body: "Different ticket"
        }), 201).comment;
      status(await f.upload(t.id, {
        commentId: otherComment.id
      }), 404);
      for (let i = 0; i < 3; i++) status(await f.upload(t.id), 201);
      const expectedVersion = (await Ticket.findById(t.id)).version;
      const competing = await Promise.all([f.upload(t.id, {
        expectedVersion
      }), f.upload(t.id, {
        expectedVersion
      })]);
      assert.deepEqual(competing.map(r => r.status).sort(), [201, 409]);
      status(await f.upload(t.id), 409);
      assert.equal((await Ticket.findById(t.id)).attachmentCount, 5);
      assert.equal(await Attachment.countDocuments({
        ticket: t.id,
        state: "READY"
      }), 5);
    });
    await context.test("upload finalization compensation, pending reservations, orphan cleanup and scanner gating", async () => {
      const t = await f.ticket(),
        finalize = localStorage.finalize;
      localStorage.finalize = async () => {
        throw new Error("Injected rename failure");
      };
      try {
        status(await f.upload(t.id), 503);
      } finally {
        localStorage.finalize = finalize;
      }
      assert.ok(await Ticket.exists({
        _id: t.id
      }));
      assert.equal((await Ticket.findById(t.id)).attachmentCount, 0);
      assert.equal((await Attachment.findOne({
        ticket: t.id
      })).state, "REJECTED");
      const orphan = await localStorage.temporary(PNG),
        old = new Date(Date.now() - 7200000);
      await utimes(path.join(f.storageRoot, "temporary", orphan), old, old);
      assert.equal((await cleanupAttachments()).orphanFiles, 1);
      let release;
      const waiting = new Promise(resolve => {
        release = resolve;
      });
      let entered;
      const reserved = new Promise(resolve => {
        entered = resolve;
      });
      localStorage.finalize = async name => {
        entered();
        await waiting;
        return finalize(name);
      };
      const pendingUpload = f.upload(t.id);
      await reserved;
      const row = await Attachment.findOne({
        ticket: t.id,
        state: "PENDING"
      });
      status(await f.request(`/attachments/${row.id}/download`), 409);
      assert.equal((await Ticket.findById(t.id)).attachmentCount, 1);
      status(await f.command(t.id, "cancel", "employee", {
        reason: "Cancel during finalization"
      }), 200);
      release();
      try {
        status(await pendingUpload, 409);
      } finally {
        localStorage.finalize = finalize;
      }
      assert.equal((await Ticket.findById(t.id)).attachmentCount, 0);
      const scanTicket = await f.ticket();
      const unscanned = status(await f.upload(scanTicket.id), 201).attachment;
      let scannerReply = "stream: OK\0";
      const scanner = net.createServer(socket => {
        let data = Buffer.alloc(0);
        socket.on("data", chunk => {
          data = Buffer.concat([data, chunk]);
          if (data.length >= 10 + 4 + PNG.length + 4) socket.end(scannerReply);
        });
      });
      scanner.listen(0, "127.0.0.1");
      await once(scanner, "listening");
      process.env.MALWARE_SCAN_ENABLED = "true";
      process.env.CLAMAV_PORT = String(scanner.address().port);
      try {
        status(await f.request(`/attachments/${unscanned.id}/download`), 409);
        assert.equal(status(await f.upload(scanTicket.id), 201).attachment.scanStatus, "CLEAN");
        scannerReply = "stream: Test-Signature FOUND\0";
        status(await f.upload(scanTicket.id), 422);
        scannerReply = "stream: scan failure ERROR\0";
        status(await f.upload(scanTicket.id), 503);
        assert.equal(await Attachment.countDocuments({
          ticket: scanTicket.id,
          state: "READY"
        }), 2);
      } finally {
        delete process.env.MALWARE_SCAN_ENABLED;
        delete process.env.CLAMAV_PORT;
        await new Promise(resolve => scanner.close(resolve));
      }
    });
    await context.test("asset uniqueness, nullable serials, exact money and scoped inventory", async () => {
      const tag = `UNIQUE-${randomUUID()}`;
      const body = {
        assetTag: tag,
        serialNumber: " serial-001 ",
        category: "LAPTOP",
        departmentId: f.dept.id,
        purchaseCost: "12345.60",
        purchaseDate: "2026-01-01",
        warrantyEndDate: "2027-01-01"
      };
      const competing = await Promise.all([f.post("/assets", "triage", body), f.post("/assets", "triage", body)]);
      assert.deepEqual(competing.map(r => r.status).sort(), [201, 409]);
      const asset = competing.find(r => r.status === 201).body.data.asset;
      assert.equal(asset.purchaseCost, "12345.60");
      assert.equal(asset.currency, "PHP");
      status(await f.post("/assets", "triage", {
        ...body,
        assetTag: "DIFFERENT-TAG"
      }), 409);
      const blank1 = await f.asset({
          serialNumber: ""
        }),
        blank2 = await f.asset({
          serialNumber: "   "
        });
      assert.equal(blank1.serialNumber, null);
      assert.equal(blank2.serialNumber, null);
      status(await f.post("/assets", "admin", {
        ...body,
        assetTag: "ADMIN-DENIED",
        serialNumber: null
      }), 403);
      status(await f.post("/assets", "triage", {
        ...body,
        assetTag: "WRONG-ORG",
        serialNumber: null,
        organization: f.foreignOrg.id
      }), 400);
      status(await f.post("/assets", "triage", {
        ...body,
        assetTag: "BAD-LOCATION",
        serialNumber: null,
        locationId: f.otherLocation.id
      }), 422);
      status(await f.post("/assets", "triage", {
        ...body,
        assetTag: "BAD-WARRANTY",
        serialNumber: null,
        warrantyEndDate: "2025-01-01"
      }), 400);
      status(await f.post("/assets", "triage", {
        ...body,
        assetTag: "BAD-COST",
        serialNumber: null,
        purchaseCost: 12.30
      }), 400);
      for (const actor of ["employee", "admin", "other", "foreign"]) {
        assert.equal(status(await f.request(`/assets?search=${tag}`, {
          actor
        }), 200).pagination.total, 0);
        status(await f.request(`/assets/${asset.id}`, {
          actor
        }), 404);
      }
      for (const actor of ["tech", "supervisor"]) {
        const scoped = status(await f.request(`/assets/${asset.id}`, {
          actor
        }), 200).asset;
        assert.equal("purchaseCost" in scoped, false);
        status(await f.request(`/assets/${asset.id}/custody`, {
          actor
        }), 404);
      }
    });
    await context.test("custody unique index, assignment races, stale commands, idempotency and returns", async () => {
      const a = await f.asset(),
        key = randomUUID(),
        body = {
          expectedVersion: 0,
          custodianId: f.users.employee.id,
          locationId: f.location.id
        };
      const responses = await Promise.all([f.post(`/assets/${a.id}/assign`, "triage", body, key), f.post(`/assets/${a.id}/assign`, "triage", {
        ...body,
        custodianId: f.users.peer.id
      })]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      assert.equal(await AssetAssignment.countDocuments({
        asset: a.id,
        returnedAt: null
      }), 1);
      assert.equal(await AssetEvent.countDocuments({
        asset: a.id,
        type: "ASSIGNED"
      }), 1);
      const assignment = await AssetAssignment.findOne({
        asset: a.id,
        returnedAt: null
      });
      await assert.rejects(AssetAssignment.create({
        ...assignment.toObject(),
        _id: new mongoose.Types.ObjectId()
      }), error => error.code === 11000);
      const replayBody = assignment.custodian.toString() === f.users.employee.id ? body : {
        ...body,
        custodianId: f.users.peer.id
      };
      if (responses[0].status === 200) {
        const replay = await f.post(`/assets/${a.id}/assign`, "triage", replayBody, key);
        status(replay, 200);
        assert.equal(replay.headers.get("idempotency-replayed"), "true");
      }
      status(await f.assetCommand(a.id, "return", {
        condition: "DAMAGED",
        notes: "Must not clear accountability"
      }), 409);
      const winner = assignment.custodian.toString() === f.users.employee.id ? "employee" : "peer";
      const own = status(await f.request(`/assets/${a.id}`, {
        actor: winner
      }), 200).asset;
      assert.ok(own.myAssignment);
      assert.equal("currentCustody" in own, false);
      assert.equal("purchaseCost" in own, false);
      status(await f.assetCommand(a.id, "return", {
        condition: "GOOD",
        notes: "Normal return"
      }), 200);
      assert.equal(await AssetAssignment.countDocuments({
        asset: a.id,
        returnedAt: null
      }), 0);
      assert.equal((await Asset.findById(a.id)).status, "AVAILABLE");
      status(await f.request(`/assets/${a.id}`, {
        actor: winner
      }), 404);
      status(await f.request(`/assets/${a.id}`, {
        method: "PATCH",
        actor: "triage",
        key: randomUUID(),
        body: {
          expectedVersion: 2,
          departmentId: f.otherDept.id,
          locationId: f.otherLocation.id,
          reason: "Forbidden transfer"
        }
      }), 403);
      status(await f.assetCommand(a.id, "assign", {
        custodianId: f.users.other.id
      }), 422);
    });
    await context.test("shared and owned ticket selection, immutable snapshots, safe backlinks, repair and loss", async () => {
      const a = await f.asset({
        shared: true,
        purchaseCost: "90000.00",
        model: "Original model"
      });
      const selectable = status(await f.request(`/assets/selectable?serviceItemId=${f.service.id}&locationId=${f.location.id}`), 200);
      assert.ok(selectable.assets.some(item => item.assetId === a.id));
      assert.equal(JSON.stringify(selectable).includes("90000"), false);
      const t = await f.ticket("employee", {
        assetIds: [a.id, a.id],
        primaryAssetId: a.id
      });
      assert.equal(t.assetSnapshots.length, 1);
      assert.equal(t.assetSnapshots[0].primary, true);
      status(await f.assetCommand(a.id, "assign", {
        custodianId: f.users.employee.id
      }), 200);
      status(await f.assetCommand(a.id, "state", {
        action: "SEND_FOR_REPAIR",
        reason: "Repair linked issue",
        ticketId: t.id
      }), 200);
      assert.equal((await Asset.findById(a.id)).status, "UNDER_REPAIR");
      assert.equal(await AssetAssignment.countDocuments({
        asset: a.id,
        returnedAt: null
      }), 1);
      status(await f.assetCommand(a.id, "return", {
        condition: "GOOD"
      }), 409);
      status(await f.assetCommand(a.id, "state", {
        action: "COMPLETE_REPAIR",
        reason: "Verified repair",
        condition: "GOOD"
      }), 200);
      assert.equal((await Asset.findById(a.id)).status, "ASSIGNED");
      status(await f.assetCommand(a.id, "state", {
        action: "MARK_LOST",
        reason: "Incident recorded",
        reference: "INCIDENT-001"
      }), 200);
      assert.equal(await AssetAssignment.countDocuments({
        asset: a.id,
        returnedAt: null
      }), 1);
      status(await f.assetCommand(a.id, "state", {
        action: "RECOVER",
        reason: "Located equipment",
        condition: "GOOD"
      }), 200);
      status(await f.assetCommand(a.id, "return", {
        condition: "GOOD"
      }), 200);
      status(await f.assetCommand(a.id, "assign", {
        custodianId: f.users.peer.id
      }), 200);
      const current = await Asset.findById(a.id);
      status(await f.request(`/assets/${a.id}`, {
        actor: "triage",
        method: "PATCH",
        key: randomUUID(),
        body: {
          expectedVersion: current.version,
          model: "New model"
        }
      }), 200);
      const historical = status(await f.request(`/tickets/${t.id}`), 200).ticket;
      assert.deepEqual(historical.assetSnapshots, t.assetSnapshots);
      status(await f.request(`/assets/${a.id}`), 404);
      assert.equal(status(await f.request(`/assets/${a.id}/tickets`, {
        actor: "peer"
      }), 200).pagination.total, 0);
      assert.equal(status(await f.request(`/assets/${a.id}/tickets`, {
        actor: "triage"
      }), 200).pagination.total, 1);
      await ServiceItem.updateOne({
        _id: f.service._id
      }, {
        $set: {
          assetPolicy: "OWN_ONLY"
        }
      });
      status(await f.post("/tickets", "employee", {
        serviceItemId: f.service.id,
        title: "Invalid equipment selection",
        description: "This asset is now assigned to another employee.",
        urgency: "HIGH",
        assetIds: [a.id]
      }), 422);
      await ServiceItem.updateOne({
        _id: f.service._id
      }, {
        $set: {
          assetPolicy: "NONE"
        }
      });
      assert.equal(status(await f.request(`/assets/selectable?serviceItemId=${f.service.id}`, {
        actor: "peer"
      }), 200).pagination.total, 0);
      await ServiceItem.updateOne({
        _id: f.service._id
      }, {
        $set: {
          assetPolicy: "OWN_OR_SHARED_DEPARTMENT"
        }
      });
      status(await f.assetCommand(a.id, "state", {
        action: "RETIRE",
        reason: "End of service life",
        reference: "RETIRE-001"
      }), 200);
      assert.equal(await AssetAssignment.countDocuments({
        asset: a.id,
        returnedAt: null
      }), 0);
      status(await f.assetCommand(a.id, "assign", {
        custodianId: f.users.employee.id
      }), 409);
      status(await f.post("/assets", "triage", {
        assetTag: a.assetTag,
        category: "LAPTOP",
        departmentId: f.dept.id
      }), 409);
    });
    await context.test("department corrections require both scopes and stop after custody history", async () => {
      const a = await f.asset();
      const grant = await AccessGrant.create({
        organization: f.org._id,
        user: f.users.triage._id,
        capability: "asset_manage",
        department: f.otherDept._id,
        grantedBy: f.users.admin._id
      });
      status(await f.request(`/assets/${a.id}`, {
        actor: "triage",
        method: "PATCH",
        key: randomUUID(),
        body: {
          expectedVersion: 0,
          departmentId: f.otherDept.id,
          locationId: f.otherLocation.id,
          reason: "Correct never-assigned ownership"
        }
      }), 200);
      status(await f.assetCommand(a.id, "assign", {
        custodianId: f.users.other.id
      }), 200);
      status(await f.assetCommand(a.id, "return", {
        condition: "GOOD"
      }), 200);
      status(await f.request(`/assets/${a.id}`, {
        actor: "triage",
        method: "PATCH",
        key: randomUUID(),
        body: {
          expectedVersion: 3,
          departmentId: f.dept.id,
          locationId: f.location.id,
          reason: "Must reject after custody"
        }
      }), 409);
      await AccessGrant.updateOne({
        _id: grant._id
      }, {
        $set: {
          isActive: false,
          revokedAt: new Date()
        }
      });
      status(await f.request(`/assets/${a.id}`, {
        actor: "triage"
      }), 404);
    });
    await context.test("asset transaction rollback includes custody, history, audit, outbox and idempotency", async () => {
      const a = await f.asset(),
        original = OutboxEvent.create,
        key = randomUUID();
      OutboxEvent.create = async function (documents, options) {
        if (documents[0]?.eventType === "ASSET_ASSIGNED") throw new Error("Injected outbox failure");
        return original.call(this, documents, options);
      };
      try {
        status(await f.assetCommand(a.id, "assign", {
          custodianId: f.users.employee.id
        }, "triage", key), 500);
      } finally {
        OutboxEvent.create = original;
      }
      assert.equal((await Asset.findById(a.id)).version, 0);
      assert.equal(await AssetAssignment.countDocuments({
        asset: a.id
      }), 0);
      assert.equal(await AssetEvent.countDocuments({
        asset: a.id
      }), 1);
      assert.equal(await AuthenticationAudit.countDocuments({
        asset: a.id,
        eventType: "ASSET_ASSIGNED"
      }), 0);
      assert.equal(await IdempotencyKey.countDocuments({
        key
      }), 0);
      status(await f.assetCommand(a.id, "assign", {
        custodianId: f.users.employee.id
      }, "triage", key), 200);
      const v = (await Asset.findById(a.id)).version;
      const outcomes = await Promise.all([f.post(`/assets/${a.id}/return`, "triage", {
        expectedVersion: v,
        condition: "GOOD"
      }), f.post(`/assets/${a.id}/state`, "triage", {
        expectedVersion: v,
        action: "RETIRE",
        reason: "Concurrent retirement",
        reference: "RACE-001"
      })]);
      assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 409]);
      assert.equal(await AssetAssignment.countDocuments({
        asset: a.id,
        returnedAt: null
      }), 0);
    });
    await context.test("concurrent identical retries, missing keys/versions, and ticket command rollback", async () => {
      const t = await f.ticket(),
        key = randomUUID();
      const retries = await Promise.all([f.post(`/tickets/${t.id}/claim`, "tech", {
        expectedVersion: 0
      }, key), f.post(`/tickets/${t.id}/claim`, "tech", {
        expectedVersion: 0
      }, key)]);
      assert.deepEqual(retries.map(r => r.status), [200, 200]);
      assert.equal(await TicketEvent.countDocuments({
        ticket: t.id,
        type: "CLAIMED"
      }), 1);
      status(await f.request(`/tickets/${t.id}/start`, {
        method: "POST",
        actor: "tech",
        body: {
          expectedVersion: 1
        }
      }), 400);
      status(await f.post(`/tickets/${t.id}/start`, "tech", {}), 400);
      const original = AuthenticationAudit.create;
      AuthenticationAudit.create = async function (docs, options) {
        if (docs[0]?.eventType === "TICKET_PUBLIC_REPLY_ADDED") throw new Error("Injected comment audit failure");
        return original.call(this, docs, options);
      };
      try {
        status(await f.command(t.id, "comments", "tech", {
          body: "Must roll back the reply and first response"
        }), 500);
      } finally {
        AuthenticationAudit.create = original;
      }
      assert.equal(await TicketComment.countDocuments({
        ticket: t.id
      }), 0);
      assert.equal((await Ticket.findById(t.id)).version, 1);
      assert.equal((await Ticket.findById(t.id)).firstResponseAt, undefined);
      const a = await f.asset(),
        assignKey = randomUUID(),
        body = {
          expectedVersion: 0,
          custodianId: f.users.employee.id
        };
      const assetRetries = await Promise.all([f.post(`/assets/${a.id}/assign`, "triage", body, assignKey), f.post(`/assets/${a.id}/assign`, "triage", body, assignKey)]);
      assert.deepEqual(assetRetries.map(r => r.status), [200, 200]);
      status(await f.post(`/assets/${a.id}/assign`, "triage", {
        ...body,
        custodianId: f.users.peer.id
      }, assignKey), 409);
      const uploadKey = randomUUID(),
        v = (await Ticket.findById(t.id)).version;
      const uploaded = status(await f.upload(t.id, {
        expectedVersion: v,
        key: uploadKey
      }), 201).attachment;
      const replay = await f.upload(t.id, {
        expectedVersion: v,
        key: uploadKey
      });
      status(replay, 201);
      assert.equal(replay.headers.get("idempotency-replayed"), "true");
      assert.equal(replay.body.data.attachment.id, uploaded.id);
      assert.equal((await Ticket.findById(t.id)).attachmentCount, 1);
    });
    await context.test("out-of-window reopening, material changes, and terminal edit protection", async () => {
      const t = await f.ticket();
      status(await f.command(t.id, "claim", "tech"), 200);
      status(await f.command(t.id, "start", "tech"), 200);
      status(await f.command(t.id, "resolve", "tech", {
        summary: "Resolved issue",
        resolutionCode: "FIXED"
      }), 200);
      status(await f.command(t.id, "reopen", "employee", {
        reason: "Different issue",
        sameIssue: false
      }), 409);
      await Ticket.updateOne({
        _id: t.id
      }, {
        $set: {
          "resolution.resolvedAt": new Date("2025-01-01T00:00:00Z")
        }
      });
      status(await f.command(t.id, "reopen", "employee", {
        reason: "Too late",
        sameIssue: true
      }), 409);
      status(await f.command(t.id, "reopen", "triage", {
        reason: "Supervisor exception for same incident"
      }), 200);
      await Ticket.collection.updateOne({
        _id: new mongoose.Types.ObjectId(t.id)
      }, {
        $set: {
          status: "REJECTED"
        }
      });
      status(await f.command(t.id, "comments", "employee", {
        body: "Terminal comment"
      }), 409);
      status(await f.upload(t.id), 409);
      status(await f.request(`/tickets/${t.id}`, {
        method: "PATCH",
        key: randomUUID(),
        body: {
          expectedVersion: (await Ticket.findById(t.id)).version,
          title: "Terminal descriptive update"
        }
      }), 409);
    });
    await context.test("serial concurrency and current account/scope checks on both operations", async () => {
      const serial = `SER-${randomUUID()}`,
        body = {
          category: "LAPTOP",
          departmentId: f.dept.id,
          serialNumber: serial
        };
      const outcomes = await Promise.all([f.post("/assets", "triage", {
        ...body,
        assetTag: randomUUID()
      }), f.post("/assets", "triage", {
        ...body,
        assetTag: randomUUID()
      })]);
      assert.deepEqual(outcomes.map(r => r.status).sort(), [201, 409]);
      const a = await f.asset();
      await User.updateOne({
        _id: f.users.peer._id
      }, {
        $set: {
          accountStatus: "INACTIVE"
        }
      });
      status(await f.assetCommand(a.id, "assign", {
        custodianId: f.users.peer.id
      }), 422);
      await User.updateOne({
        _id: f.users.peer._id
      }, {
        $set: {
          accountStatus: "ACTIVE"
        }
      });
      const t = await f.ticket();
      status(await f.command(t.id, "claim", "tech2"), 200);
      const file = status(await f.upload(t.id, {
        actor: "tech2",
        visibility: "INTERNAL"
      }), 201).attachment;
      await AccessGrant.updateOne({
        _id: f.grants["tech2:support"]._id
      }, {
        $set: {
          isActive: false,
          revokedAt: new Date()
        }
      });
      status(await f.request(`/attachments/${file.id}/download`, {
        actor: "tech2"
      }), 404);
      await AccessGrant.updateOne({
        _id: f.grants["triage:asset_manage"]._id
      }, {
        $set: {
          isActive: false,
          revokedAt: new Date()
        }
      });
      status(await f.assetCommand(a.id, "assign", {
        custodianId: f.users.employee.id
      }), 404);
      f.grants["triage:asset_manage"] = await AccessGrant.create({
        organization: f.org._id,
        user: f.users.triage._id,
        capability: "asset_manage",
        department: f.dept._id,
        grantedBy: f.users.admin._id
      });
      await Session.updateMany({
        user: f.users.peer._id
      }, {
        $set: {
          revokedAt: new Date(),
          revocationReason: "USER_REVOKED"
        }
      });
      status(await f.request("/assets", {
        actor: "peer"
      }), 401);
    });
    await context.test("index migration retains old public history, original clock and snapshot revisions", async () => {
      const t = await f.ticket();
      status(await f.command(t.id, "claim", "tech"), 200);
      status(await f.command(t.id, "start", "tech"), 200);
      const before = await Ticket.findById(t.id).lean(),
        cycle = await SlaCycle.findOne({
          ticket: t.id
        }).lean();
      await TicketEvent.collection.updateMany({
        ticket: new mongoose.Types.ObjectId(t.id)
      }, {
        $unset: {
          visibility: ""
        }
      });
      await Ticket.collection.updateOne({
        _id: new mongoose.Types.ObjectId(t.id)
      }, {
        $unset: {
          workStartedAt: "",
          attachmentCount: "",
          slaCycleNumber: ""
        }
      });
      assert.equal(status(await f.request(`/tickets/${t.id}/events`), 200).pagination.total, 3);
      await createIndexes();
      await createIndexes();
      const after = await Ticket.findById(t.id).lean();
      assert.equal(after.attachmentCount, 0);
      assert.equal(after.slaCycleNumber, 1);
      assert.ok(after.workStartedAt);
      assert.deepEqual(after.configurationSnapshots, before.configurationSnapshots);
      assert.deepEqual((await SlaCycle.findById(cycle._id)).startedAt, cycle.startedAt);
      const indexes = await AssetAssignment.collection.indexes();
      assert.equal(indexes.find(i => i.name === "one_active_asset_custodian").unique, true);
    });
  } finally {
    await f.close();
  }
});
test("three business day reopening deadline uses timezone, nonworking dates, holidays and inclusive boundary", () => {
  const calendar = {
    timezone: "Asia/Manila",
    weeklyWindows: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(day => ({
      day,
      start: "08:00",
      end: "17:00"
    })),
    holidays: [{
      date: "2026-12-25"
    }]
  };
  const deadline = reopenDeadline(new Date("2026-12-24T08:30:00Z"), calendar);
  assert.equal(deadline.toISOString(), "2026-12-30T08:30:00.000Z");
  assert.ok(new Date("2026-12-30T08:30:00Z") <= deadline);
  assert.ok(new Date("2026-12-30T08:30:00.001Z") > deadline);
  const dst = {
    ...calendar,
    timezone: "America/New_York",
    holidays: []
  };
  assert.equal(reopenDeadline(new Date("2026-03-06T15:00:00Z"), dst).toISOString(), "2026-03-11T14:00:00.000Z");
});
test("resolution pauses subtract only business time; response clocks and completed cycles remain intact", () => {
  const calendar = {
    timezone: "Asia/Manila",
    weeklyWindows: [{
      day: "MONDAY",
      start: "08:00",
      end: "17:00"
    }],
    holidays: []
  };
  const cycle = {
    cycleNumber: 1,
    startedAt: new Date("2026-10-19T00:00:00Z"),
    endedAt: new Date("2026-10-19T09:00:00Z"),
    endReason: "RESOLVED",
    configurationSnapshots: {
      businessCalendar: calendar
    }
  };
  const pause = {
    clock: "RESOLUTION",
    startedAt: new Date("2026-10-19T01:00:00Z"),
    endedAt: new Date("2026-10-19T03:00:00Z")
  };
  const elapsed = cycleElapsed(cycle, [pause], new Date("2026-10-25T00:00:00Z"));
  assert.equal(elapsed.responseElapsedMilliseconds, 9 * 3600000);
  assert.equal(elapsed.resolutionElapsedMilliseconds, 7 * 3600000);
  assert.equal(elapsed.resolutionPausedMilliseconds, 2 * 3600000);
  assert.deepEqual(cycleElapsed(cycle, [pause], new Date("2030-01-01T00:00:00Z")), elapsed);
  assert.equal(cycleElapsed(cycle, []).resolutionElapsedMilliseconds, 9 * 3600000);
});
