import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { operationsFixture } from "./support/operations.js";
import { Approval } from "../src/modules/approvals/approval.model.js";
import { Organization } from "../src/modules/organization/organization.model.js";
import { Department } from "../src/modules/organization/department.model.js";
import { ServiceItem } from "../src/modules/catalog/serviceItem.model.js";
import { User } from "../src/modules/users/user.model.js";
import { AccessGrant } from "../src/modules/access/accessGrant.model.js";
import { Ticket } from "../src/modules/tickets/ticket.model.js";
import { TicketComment } from "../src/modules/tickets/ticketComment.model.js";
import { TicketEvent } from "../src/modules/tickets/ticketEvent.model.js";
import { TicketCounter } from "../src/modules/tickets/ticketCounter.model.js";
import { SlaCycle } from "../src/modules/service-levels/slaCycle.model.js";
import { SlaPause } from "../src/modules/service-levels/slaPause.model.js";
import { AuthenticationAudit } from "../src/modules/auth/authenticationAudit.model.js";
import { OutboxEvent } from "../src/modules/outbox/outboxEvent.model.js";
import { IdempotencyKey } from "../src/shared/database/idempotencyKey.model.js";
import { cycleElapsed } from "../src/modules/service-levels/slaClock.service.js";
import { createIndexes } from "../scripts/create-indexes.js";
function status(response, expected) {
  assert.equal(response.status, expected, JSON.stringify(response.body));
  return response.body?.data;
}
test("Step 8 approval rounds on an isolated replica set", async context => {
  const f = await operationsFixture("approvals");
  const service = await ServiceItem.create({
    organization: f.org._id,
    code: "APPROVED_ACCESS",
    name: "Access request",
    ticketType: "REQUEST",
    requiresApproval: true,
    slaPolicy: f.policy._id
  });
  async function configure(primary = f.users.supervisor._id, backup = f.users.triage._id) {
    // Raw writes also exercise fail-closed handling of malformed/imported configuration.
    await Department.collection.updateOne({
      _id: f.dept._id
    }, {
      $set: {
        designatedApprover: primary
      }
    });
    await Organization.collection.updateOne({
      _id: f.org._id
    }, {
      $set: {
        backupApprover: backup
      }
    });
  }
  const input = {
    serviceItemId: service.id,
    title: "Synthetic access request",
    description: "Please enable the synthetic test service for my work.",
    urgency: "MEDIUM"
  };
  async function create(actor = "employee", key = randomUUID()) {
    const ticket = status(await f.post("/tickets", actor, input, key), 201).ticket;
    const approval = await Approval.findOne({
      ticket: ticket.id,
      status: "PENDING"
    });
    assert.ok(approval);
    return {
      ticket,
      approval
    };
  }
  const decide = (approval, version, decision = "APPROVED", actor = "supervisor", note, key = randomUUID()) => f.post(`/approvals/${approval.id}/decision`, actor, {
    expectedVersion: version,
    decision,
    ...(note !== undefined ? {
      decisionNote: note
    } : {})
  }, key);
  const reroute = (ticket, approver = f.users.triage.id, version = ticket.version, actor = "triage", key = randomUUID()) => f.post(`/tickets/${ticket.id}/approval-reroutes`, actor, {
    approverId: approver,
    expectedVersion: version,
    reason: "Named approver is unavailable."
  }, key);
  async function counts() {
    const models = [Ticket, Approval, TicketEvent, SlaCycle, SlaPause, AuthenticationAudit, OutboxEvent, IdempotencyKey];
    return Promise.all(models.map(model => model.countDocuments({
      organization: f.org._id
    })));
  }
  try {
    await configure();
    await context.test("creation freezes the requirement and atomically creates the primary round, pause, audit and notifications", async () => {
      const key = randomUUID(),
        {
          ticket,
          approval
        } = await create("employee", key);
      assert.equal(ticket.status, "WAITING_APPROVAL");
      assert.equal(ticket.approvalRequired, true);
      assert.equal(ticket.currentApprovalRound, 1);
      assert.equal(approval.approver.toString(), f.users.supervisor.id);
      const stored = await Ticket.findById(ticket.id);
      assert.equal(stored.configurationSnapshots.service.requiresApproval, true);
      const cycle = await SlaCycle.findOne({
          ticket: ticket.id
        }),
        pause = await SlaPause.findOne({
          ticket: ticket.id
        });
      assert.equal(+cycle.startedAt, +stored.submittedAt);
      assert.equal(+pause.startedAt, +stored.submittedAt);
      assert.equal(pause.reason, "WAITING_APPROVAL");
      assert.equal(pause.clock, "RESOLUTION");
      assert.equal(await TicketEvent.countDocuments({
        ticket: ticket.id
      }), 2);
      assert.equal(await AuthenticationAudit.countDocuments({
        ticket: ticket.id
      }), 2);
      const notifications = await OutboxEvent.find({
        aggregateId: ticket.id
      });
      assert.equal(notifications.length, 3);
      assert.ok(notifications.every(row => row.status === "PENDING" && !row.deliveredAt && row.recipient));
      assert.ok(notifications.some(row => row.recipient.equals(f.users.supervisor._id)));
      const replay = await f.post("/tickets", "employee", input, key);
      assert.equal(status(replay, 201).ticket.id, ticket.id);
      assert.equal(replay.headers.get("idempotency-replayed"), "true");
      assert.equal(await Approval.countDocuments({
        ticket: ticket.id
      }), 1);
      status(await f.post("/tickets", "employee", {
        ...input,
        urgency: "HIGH"
      }, key), 409);
      status(await f.request("/health"), 200);
    });
    await context.test("only explicitly configured eligible fallback is selected; self, inactive and out-of-scope primaries are skipped", async () => {
      for (const primary of [null, f.users.employee._id, f.users.admin._id, f.users.foreign._id, new mongoose.Types.ObjectId()]) {
        await configure(primary);
        assert.equal((await create()).approval.approver.toString(), f.users.triage.id);
      }
      await configure();
      await User.updateOne({
        _id: f.users.supervisor._id
      }, {
        $set: {
          accountStatus: "INACTIVE"
        }
      });
      try {
        assert.equal((await create()).approval.approver.toString(), f.users.triage.id);
      } finally {
        await User.updateOne({
          _id: f.users.supervisor._id
        }, {
          $set: {
            accountStatus: "ACTIVE"
          }
        });
      }
      await AccessGrant.collection.updateOne({
        _id: f.grants["supervisor:department_supervise"]._id
      }, {
        $set: {
          department: f.otherDept._id
        }
      });
      try {
        assert.equal((await create()).approval.approver.toString(), f.users.triage.id);
      } finally {
        await AccessGrant.collection.updateOne({
          _id: f.grants["supervisor:department_supervise"]._id
        }, {
          $set: {
            department: f.dept._id
          }
        });
      }
      const self = await create("supervisor");
      assert.equal(self.approval.approver.toString(), f.users.triage.id);
      status(await decide(self.approval, 0, "APPROVED", "supervisor"), 404);
      await configure(null, f.users.supervisor._id);
      const before = await counts();
      const failed = await f.post("/tickets", "supervisor", input);
      assert.equal(status(failed, 409), undefined);
      assert.equal(failed.body.error.code, "APPROVER_CONFIGURATION_REQUIRED");
      assert.deepEqual(await counts(), before);
      await configure();
    });
    await context.test("configuration failure leaves no partial records or counter increment, and the same key can recover", async () => {
      const key = randomUUID();
      for (const backup of [null, f.users.employee._id, f.users.admin._id, f.users.foreign._id, new mongoose.Types.ObjectId()]) {
        await configure(null, backup);
        const before = await counts(),
          counter = await TicketCounter.findOne({
            organization: f.org._id
          }).lean();
        const failed = await f.post("/tickets", "employee", input, key);
        status(failed, 409);
        assert.equal(failed.body.error.code, "APPROVER_CONFIGURATION_REQUIRED");
        assert.deepEqual(await counts(), before);
        assert.deepEqual(await TicketCounter.findOne({
          organization: f.org._id
        }).lean(), counter);
      }
      await configure();
      await create("employee", key);
      // Fallback's department scope cannot cover an unrelated department.
      const cross = await f.post("/tickets", "other", input);
      status(cross, 409);
      assert.equal(cross.body.error.code, "APPROVER_CONFIGURATION_REQUIRED");
      await assert.rejects(ServiceItem.create({
        organization: f.org._id,
        code: "INVALID_INC",
        name: "Invalid incident",
        ticketType: "INCIDENT",
        requiresApproval: true,
        slaPolicy: f.policy._id
      }), /Incidents cannot require approval/);
      await ServiceItem.collection.updateOne({
        _id: f.service._id
      }, {
        $set: {
          requiresApproval: true
        }
      });
      try {
        const failed = await f.post("/tickets", "employee", {
          ...input,
          serviceItemId: f.service.id
        });
        status(failed, 409);
        assert.equal(failed.body.error.code, "APPROVAL_CONFIGURATION_INVALID");
      } finally {
        await ServiceItem.collection.updateOne({
          _id: f.service._id
        }, {
          $set: {
            requiresApproval: false
          }
        });
      }
    });
    await context.test("inbox filtering, counts, validation, public serialization, and history authorization", async () => {
      const {
        ticket,
        approval
      } = await create();
      status(await f.command(ticket.id, "comments", "triage", {
        body: "INTERNAL-DO-NOT-LEAK",
        visibility: "INTERNAL"
      }), 201);
      const internal = await TicketComment.findOne({
        ticket: ticket.id,
        visibility: "INTERNAL"
      });
      status(await f.upload(ticket.id, {
        actor: "triage",
        visibility: "INTERNAL",
        commentId: internal.id,
        filename: "private.png"
      }), 201);
      const inbox = status(await f.request("/approvals?limit=1&sort=requestedAt", {
        actor: "supervisor"
      }), 200);
      const expected = await Approval.countDocuments({
        approver: f.users.supervisor._id,
        status: "PENDING"
      });
      assert.equal(inbox.pagination.total, expected);
      assert.equal(inbox.approvals.length, 1);
      const all = status(await f.request("/approvals?limit=100", {
        actor: "supervisor"
      }), 200);
      const serialized = all.approvals.find(row => row.id === approval.id);
      assert.ok(serialized);
      for (const field of ["comments", "worklogs", "attachments", "assetSnapshots", "configurationSnapshots", "assignee", "purchaseCost"]) assert.equal(serialized.ticket[field], undefined);
      assert.ok(!JSON.stringify(all).includes("INTERNAL-DO-NOT-LEAK"));
      for (const actor of ["employee", "peer", "admin", "tech", "foreign"]) {
        assert.equal(status(await f.request("/approvals", {
          actor
        }), 200).pagination.total, 0);
        status(await decide(approval, 2, "APPROVED", actor), 404);
      }
      status(await decide(approval, 2, "APPROVED", "triage"), 404);
      for (const query of ["status=BOGUS", "from=invalid", "from=2026-12-31T00:00:00Z&to=2026-01-01T00:00:00Z", "sort=__proto__", "page=0", "limit=101", "status=PENDING&status=APPROVED", "unknown=1"]) {
        status(await f.request(`/approvals?${query}`, {
          actor: "supervisor"
        }), 400);
      }
      assert.equal(status(await f.request("/approvals?from=2099-01-01T00:00:00Z", {
        actor: "supervisor"
      }), 200).pagination.total, 0);
      status(await f.request(`/tickets/${ticket.id}/approvals`, {
        actor: "employee"
      }), 200);
      for (const actor of ["admin", "peer", "tech", "foreign"]) status(await f.request(`/tickets/${ticket.id}/approvals`, {
        actor
      }), 404);
      const events = await OutboxEvent.find({
        aggregateId: ticket.id,
        eventType: /^TICKET_APPROVAL/
      }).lean();
      assert.ok(!JSON.stringify(events).includes("INTERNAL-DO-NOT-LEAK"));
      assert.ok(!JSON.stringify(events).includes("private.png"));
    });
    await context.test("approval opens work without counting a first response and preserves frozen SLA starts", async () => {
      const {
        ticket,
        approval
      } = await create();
      const original = await Ticket.findById(ticket.id).lean();
      const cycleBefore = await SlaCycle.findOne({
        ticket: ticket.id
      }).lean();
      status(await decide(approval, 1), 409);
      status(await f.post(`/approvals/${approval.id}/decision`, "supervisor", {
        decision: "APPROVED",
        expectedVersion: 0,
        actorId: f.users.admin.id
      }), 400);
      status(await f.post(`/approvals/${approval.id}/decision`, "supervisor", {
        decision: "APPROVED"
      }), 400);
      const result = status(await decide(approval, 0, "APPROVED", "supervisor", "Approved for the stated request."), 200).approval;
      assert.equal(result.ticket.status, "OPEN");
      assert.equal(result.ticket.version, 1);
      const after = await Ticket.findById(ticket.id).lean();
      assert.equal(after.firstResponseAt, undefined);
      assert.deepEqual(after.configurationSnapshots, original.configurationSnapshots);
      assert.equal(+after.submittedAt, +original.submittedAt);
      const cycle = await SlaCycle.findOne({
        ticket: ticket.id
      }).lean();
      assert.equal(+cycle.startedAt, +cycleBefore.startedAt);
      assert.equal(cycle.firstResponseAt, undefined);
      assert.equal(cycle.endedAt, undefined);
      assert.ok((await SlaPause.findOne({
        ticket: ticket.id
      })).endedAt);
      assert.equal(await TicketComment.countDocuments({
        ticket: ticket.id
      }), 0);
      const queue = status(await f.request("/queue", {
        actor: "tech"
      }), 200);
      assert.ok(queue.tickets.some(row => row.id === ticket.id));
      status(await f.command(ticket.id, "claim", "tech"), 200);
      status(await f.command(ticket.id, "start", "tech"), 200);
      status(await f.command(ticket.id, "resolve", "tech", {
        summary: "Request fulfilled after approval.",
        resolutionCode: "FULFILLED"
      }), 200);
      status(await f.command(ticket.id, "reopen", "employee", {
        sameIssue: true,
        reason: "The same issue remains."
      }), 200);
      assert.equal((await Ticket.findById(ticket.id)).currentApprovalRound, 1);
      status(await f.command(ticket.id, "start", "tech"), 200);
      status(await f.command(ticket.id, "resolve", "tech", {
        summary: "Request fulfilled again.",
        resolutionCode: "FULFILLED"
      }), 200);
      status(await f.command(ticket.id, "close", "employee"), 200);
      assert.equal(await SlaCycle.countDocuments({
        ticket: ticket.id,
        endReason: "RESOLVED"
      }), 2);
    });
    await context.test("rejection requires explanation, finishes the cycle, and remains terminal", async () => {
      const {
        ticket,
        approval
      } = await create();
      for (const note of [undefined, "", " ", "x".repeat(2001)]) status(await decide(approval, 0, "REJECTED", "supervisor", note), 400);
      const result = status(await decide(approval, 0, "REJECTED", "supervisor", "Requested access is outside the approved duties."), 200).approval;
      assert.equal(result.status, "REJECTED");
      assert.equal(result.ticket.status, "REJECTED");
      const detail = status(await f.request(`/tickets/${ticket.id}`), 200).ticket;
      assert.equal(detail.slaCycles[0].endReason, "REJECTED");
      assert.equal(detail.slaCycles[0].resolutionTargetEligible, false);
      assert.equal(detail.firstResponseAt, null);
      assert.equal(await SlaPause.countDocuments({
        ticket: ticket.id,
        endedAt: null
      }), 0);
      status(await decide(approval, 1), 409);
      status(await f.command(ticket.id, "cancel", "employee", {
        reason: "Cancel after rejection"
      }), 409);
      status(await f.command(ticket.id, "reopen", "triage", {
        reason: "Reopen after rejection"
      }), 409);
    });
    await context.test("reroutes preserve rounds, freeze the selected approver, retain pause starts and require current triage", async () => {
      const {
        ticket,
        approval
      } = await create();
      const cycle = await SlaCycle.findOne({
          ticket: ticket.id
        }).lean(),
        pause = await SlaPause.findOne({
          ticket: ticket.id
        }).lean();
      for (const actor of ["employee", "supervisor", "tech", "admin", "foreign"]) status(await reroute(ticket, f.users.triage.id, 0, actor), 404);
      for (const id of [f.users.employee.id, f.users.tech.id, f.users.admin.id, f.users.foreign.id, new mongoose.Types.ObjectId().toString(), f.users.supervisor.id]) status(await reroute(ticket, id), 422);
      status(await f.post(`/tickets/${ticket.id}/approval-reroutes`, "triage", {
        approverId: f.users.triage.id,
        expectedVersion: 0
      }), 400);
      await configure(f.users.triage._id, null);
      assert.equal((await Approval.findById(approval.id)).approver.toString(), f.users.supervisor.id);
      await configure();
      const next = status(await reroute(ticket), 200).approval;
      assert.equal(next.round, 2);
      assert.equal(next.ticket.version, 1);
      assert.equal(next.status, "PENDING");
      const old = await Approval.findById(approval.id);
      assert.equal(old.status, "SUPERSEDED");
      assert.equal(old.supersededBy.toString(), f.users.triage.id);
      assert.equal(old.supersededReason, "Named approver is unavailable.");
      assert.equal(+old.supersededAt, +new Date(next.requestedAt));
      assert.deepEqual(await SlaCycle.findOne({
        ticket: ticket.id
      }).lean(), cycle);
      assert.deepEqual(await SlaPause.findOne({
        ticket: ticket.id
      }).lean(), pause);
      status(await decide(approval, 1), 409);
      assert.ok(!status(await f.request("/approvals?limit=100", {
        actor: "supervisor"
      }), 200).approvals.some(row => row.id === approval.id));
      const history = status(await f.request(`/tickets/${ticket.id}/approvals`), 200).approvals;
      assert.deepEqual(history.map(row => row.status), ["SUPERSEDED", "PENDING"]);
      assert.equal(history[0].supersededReason, undefined);
      const events = status(await f.request(`/tickets/${ticket.id}/events`), 200).events;
      assert.ok(!JSON.stringify(events).includes("Named approver is unavailable."));
      status(await decide({
        id: next.id
      }, 1, "APPROVED", "triage"), 200);
    });
    await context.test("decision and reroute retries reauthorize live scopes and sessions, and reject changed input", async () => {
      const {
          ticket,
          approval
        } = await create(),
        key = randomUUID();
      status(await decide(approval, 0, "APPROVED", "supervisor", "Approval evidence", key), 200);
      const replay = await decide(approval, 0, "APPROVED", "supervisor", "Approval evidence", key);
      status(replay, 200);
      assert.equal(replay.headers.get("idempotency-replayed"), "true");
      status(await decide(approval, 0, "REJECTED", "supervisor", "Different input", key), 409);
      assert.equal(await TicketEvent.countDocuments({
        ticket: ticket.id,
        type: "APPROVAL_APPROVED"
      }), 1);
      const pending = await create();
      await AccessGrant.updateOne({
        _id: f.grants["supervisor:department_supervise"]._id
      }, {
        $set: {
          isActive: false,
          revokedAt: new Date()
        }
      });
      try {
        status(await decide(approval, 0, "APPROVED", "supervisor", "Approval evidence", key), 404);
        status(await decide(pending.approval, 0), 404);
        assert.equal(status(await f.request("/approvals", {
          actor: "supervisor"
        }), 200).pagination.total, 0);
        assert.equal((await Approval.findById(pending.approval.id)).approver.toString(), f.users.supervisor.id);
      } finally {
        await AccessGrant.updateOne({
          _id: f.grants["supervisor:department_supervise"]._id
        }, {
          $set: {
            isActive: true
          },
          $unset: {
            revokedAt: 1
          }
        });
      }
      await User.updateOne({
        _id: f.users.supervisor._id
      }, {
        $set: {
          accountStatus: "INACTIVE"
        }
      });
      try {
        status(await decide(pending.approval, 0), 401);
      } finally {
        await User.updateOne({
          _id: f.users.supervisor._id
        }, {
          $set: {
            accountStatus: "ACTIVE"
          }
        });
      }
      // Authentication intentionally revokes sessions observed while the account is inactive.
      const login = await f.post("/auth/login", null, {
        email: f.users.supervisor.email,
        password: "Synthetic-Test-Password-67!"
      });
      const loginData = status(login, 200);
      f.auth.supervisor = {
        cookie: login.headers.get("set-cookie").split(";")[0],
        csrf: loginData.csrfToken
      };
      const rerouteKey = randomUUID();
      const rerouted = status(await reroute(pending.ticket, f.users.triage.id, 0, "triage", rerouteKey), 200);
      const again = await reroute(pending.ticket, f.users.triage.id, 0, "triage", rerouteKey);
      assert.equal(status(again, 200).approval.id, rerouted.approval.id);
      assert.equal(again.headers.get("idempotency-replayed"), "true");
      status(await reroute(pending.ticket, f.users.supervisor.id, 0, "triage", rerouteKey), 409);
      await AccessGrant.updateOne({
        _id: f.grants["triage:ticket_triage"]._id
      }, {
        $set: {
          isActive: false
        }
      });
      try {
        status(await reroute(pending.ticket, f.users.triage.id, 0, "triage", rerouteKey), 404);
      } finally {
        await AccessGrant.updateOne({
          _id: f.grants["triage:ticket_triage"]._id
        }, {
          $set: {
            isActive: true
          }
        });
      }
    });
    await context.test("cancellation supersedes the pending round and finalizes its pause and cycle", async () => {
      for (const actor of ["employee", "triage"]) {
        const {
          ticket,
          approval
        } = await create();
        status(await f.command(ticket.id, "cancel", actor, {
          reason: "x".repeat(5000)
        }), 200);
        const stored = await Ticket.findById(ticket.id);
        assert.equal(stored.status, "CANCELLED");
        assert.equal(stored.approvalStatus, "SUPERSEDED");
        assert.equal((await Approval.findById(approval.id)).status, "SUPERSEDED");
        assert.equal((await SlaCycle.findOne({
          ticket: ticket.id
        })).endReason, "CANCELLED");
        assert.ok((await SlaPause.findOne({
          ticket: ticket.id
        })).endedAt);
        status(await decide(approval, 1), 409);
      }
    });
    await context.test("competing approve, reject, reroute and cancel commands have exactly one committed winner", async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const {
          ticket,
          approval
        } = await create();
        const results = await Promise.all([decide(approval, 0), decide(approval, 0, "REJECTED", "supervisor", "Rejected in race"), reroute(ticket), f.post(`/tickets/${ticket.id}/cancel`, "employee", {
          expectedVersion: 0,
          reason: "Cancelled in race"
        })]);
        assert.deepEqual(results.map(row => row.status).sort(), [200, 409, 409, 409], JSON.stringify(results));
        const after = await Ticket.findById(ticket.id);
        assert.equal(after.version, 1);
        const rows = await Approval.find({
          ticket: ticket.id
        }).sort({
          round: 1
        });
        assert.equal(rows.filter(row => row.status === "PENDING").length, after.status === "WAITING_APPROVAL" ? 1 : 0);
        assert.equal(rows.length, after.status === "WAITING_APPROVAL" ? 2 : 1);
        assert.equal(await IdempotencyKey.countDocuments({
          operation: {
            $in: [`approval:decision:${approval.id}`, `approval:reroute:${ticket.id}`, `ticket:cancel:${ticket.id}`]
          }
        }), 1);
      }
    });
    await context.test("concurrent identical creation, decision and reroute retries write exactly one result", async () => {
      const creationKey = randomUUID();
      const created = await Promise.all([f.post("/tickets", "employee", input, creationKey), f.post("/tickets", "employee", input, creationKey)]);
      const ids = created.map(response => status(response, 201).ticket.id);
      assert.equal(new Set(ids).size, 1);
      const ticket = created[0].body.data.ticket;
      const approval = await Approval.findOne({
        ticket: ticket.id
      });
      const rerouteKey = randomUUID();
      const rerouted = await Promise.all([reroute(ticket, f.users.triage.id, 0, "triage", rerouteKey), reroute(ticket, f.users.triage.id, 0, "triage", rerouteKey)]);
      const next = rerouted.map(response => status(response, 200).approval);
      assert.equal(next[0].id, next[1].id);
      const decisionKey = randomUUID();
      const decisions = await Promise.all([decide(next[0], 1, "APPROVED", "triage", "Concurrent retry", decisionKey), decide(next[0], 1, "APPROVED", "triage", "Concurrent retry", decisionKey)]);
      decisions.forEach(response => status(response, 200));
      assert.equal((await Ticket.findById(ticket.id)).version, 2);
      assert.equal(await Approval.countDocuments({
        ticket: ticket.id
      }), 2);
      assert.equal((await Approval.findById(approval.id)).status, "SUPERSEDED");
      assert.equal(await TicketEvent.countDocuments({
        ticket: ticket.id,
        type: "APPROVAL_REROUTED"
      }), 1);
      assert.equal(await TicketEvent.countDocuments({
        ticket: ticket.id,
        type: "APPROVAL_APPROVED"
      }), 1);
    });
    await context.test("actual indexes enforce both pending and round uniqueness, with same-organization and self-approval validation", async () => {
      await createIndexes();
      const indexes = await Approval.collection.indexes();
      assert.ok(indexes.some(index => index.name === "approval_one_pending_per_ticket" && index.unique && index.partialFilterExpression.status === "PENDING"));
      const {
        ticket,
        approval
      } = await create();
      const row = {
        organization: f.org._id,
        ticket: ticket.id,
        approver: f.users.triage._id,
        requestedAt: new Date(),
        status: "PENDING"
      };
      await assert.rejects(Approval.create({
        ...row,
        round: 2
      }), error => error.code === 11000);
      await assert.rejects(Approval.create({
        ...row,
        round: 1,
        status: "SUPERSEDED"
      }), error => error.code === 11000);
      await assert.rejects(Approval.create({
        ...row,
        round: 2,
        approver: f.users.employee._id
      }), /Requester cannot approve/);
      await assert.rejects(Approval.create({
        ...row,
        round: 2,
        organization: f.foreignOrg._id
      }), /same organization/);
      await assert.rejects(Approval.create({
        ...row,
        round: 2,
        approver: f.users.foreign._id
      }), /same organization/);
      assert.equal((await Approval.findById(approval.id)).status, "PENDING");
    });
    await context.test("all fulfillment paths enforce the persisted approved round even if status flags or catalog settings drift", async () => {
      const {
        ticket
      } = await create();
      await ServiceItem.updateOne({
        _id: service._id
      }, {
        $set: {
          requiresApproval: false
        }
      });
      try {
        status(await f.command(ticket.id, "assignment", "triage", {
          assigneeId: f.users.tech.id,
          reason: "Try pending assignment"
        }), 409);
        const actions = [["triage", "triage", "OPEN", {
          category: "ACCESS",
          impact: "HIGH"
        }], ["claim", "tech", "OPEN", {}], ["assignment", "triage", "OPEN", {
          assigneeId: f.users.tech.id,
          reason: "Try bypass"
        }], ["start", "tech", "OPEN", {}], ["wait", "tech", "IN_PROGRESS", {
          status: "WAITING_REQUESTER",
          reason: "Try bypass",
          nextStep: "Provide information"
        }], ["resume", "tech", "WAITING_VENDOR", {
          dependencyUpdate: "Dependency completed"
        }], ["resolve", "tech", "IN_PROGRESS", {
          summary: "Try bypass",
          resolutionCode: "FULFILLED"
        }], ["worklogs", "tech", "IN_PROGRESS", {
          start: "2026-10-20T01:00:00Z",
          end: "2026-10-20T02:00:00Z",
          notes: "Try bypass"
        }], ["comments", "employee", "WAITING_REQUESTER", {
          body: "Requested public response",
          visibility: "PUBLIC"
        }], ["reopen", "triage", "RESOLVED", {
          reason: "Try bypass"
        }]];
        for (const [action, actor, state, body] of actions) {
          await Ticket.collection.updateOne({
            _id: new mongoose.Types.ObjectId(ticket.id)
          }, {
            $set: {
              status: state,
              approvalStatus: "APPROVED",
              assignee: action === "claim" ? null : f.users.tech._id
            }
          });
          status(await f.command(ticket.id, action, actor, body), 409);
        }
        assert.equal(await TicketComment.countDocuments({
          ticket: ticket.id
        }), 0);
        assert.equal((await Ticket.findById(ticket.id)).version, 0);
      } finally {
        await ServiceItem.updateOne({
          _id: service._id
        }, {
          $set: {
            requiresApproval: true
          }
        });
        await Ticket.collection.updateOne({
          _id: new mongoose.Types.ObjectId(ticket.id)
        }, {
          $set: {
            status: "WAITING_APPROVAL",
            approvalStatus: "PENDING",
            assignee: null
          }
        });
      }
      const stored = await Ticket.findById(ticket.id);
      assert.equal(stored.configurationSnapshots.service.requiresApproval, true);
      status(await f.request(`/tickets/${ticket.id}`, {
        method: "PATCH",
        actor: "triage",
        key: randomUUID(),
        body: {
          expectedVersion: 0,
          approvalStatus: "APPROVED",
          reason: "Try bypass"
        }
      }), 400);
    });
    await context.test("audit and outbox failures roll back approval creation, decisions, reroutes and cancellations", async () => {
      const existing = await create();
      const cases = [["TICKET_APPROVAL_REQUESTED", () => f.post("/tickets", "employee", input)], ["TICKET_APPROVAL_APPROVED", () => decide(existing.approval, 0)], ["TICKET_APPROVAL_REJECTED", () => decide(existing.approval, 0, "REJECTED", "supervisor", "Rejected")], ["TICKET_APPROVAL_REROUTED", () => reroute(existing.ticket)], ["TICKET_APPROVAL_SUPERSEDED", () => f.command(existing.ticket.id, "cancel", "employee", {
        reason: "Cancellation"
      })]];
      for (const Model of [AuthenticationAudit, OutboxEvent]) {
        for (const [eventType, command] of cases) {
          const before = await counts(),
            original = Model.create;
          const ticketBefore = await Ticket.findById(existing.ticket.id).lean();
          const approvalBefore = await Approval.findById(existing.approval.id).lean();
          const pauseBefore = await SlaPause.findOne({
            ticket: existing.ticket.id
          }).lean();
          Model.create = function (docs, ...args) {
            if ((Array.isArray(docs) ? docs[0] : docs).eventType === eventType) throw new Error("Injected approval persistence failure");
            return original.call(this, docs, ...args);
          };
          try {
            status(await command(), 500);
          } finally {
            Model.create = original;
          }
          assert.deepEqual(await counts(), before);
          assert.deepEqual(await Ticket.findById(existing.ticket.id).lean(), ticketBefore);
          assert.deepEqual(await Approval.findById(existing.approval.id).lean(), approvalBefore);
          assert.deepEqual(await SlaPause.findOne({
            ticket: existing.ticket.id
          }).lean(), pauseBefore);
        }
      }
      status(await decide(existing.approval, 0), 200);
    });
    await context.test("approval routes preserve cookies, CSRF and origin controls", async () => {
      const {
        approval
      } = await create();
      status(await f.request("/approvals", {
        actor: null
      }), 401);
      const body = {
        expectedVersion: 0,
        decision: "APPROVED"
      };
      status(await f.request(`/approvals/${approval.id}/decision`, {
        actor: "supervisor",
        method: "POST",
        body,
        key: randomUUID(),
        headers: {
          "X-CSRF-Token": "bad"
        }
      }), 403);
      status(await f.request(`/approvals/${approval.id}/decision`, {
        actor: "supervisor",
        method: "POST",
        body,
        key: randomUUID(),
        headers: {
          Origin: "https://untrusted.example"
        }
      }), 403);
      status(await f.request(`/approvals/${approval.id}/decision`, {
        actor: "supervisor",
        method: "POST",
        body
      }), 400);
    });
  } finally {
    await f.close();
  }
});
test("approval pauses only resolution time and rejection excludes resolution attainment", () => {
  const start = new Date("2026-10-19T00:00:00Z"),
    decision = new Date("2026-10-19T02:00:00Z");
  const cycle = {
    cycleNumber: 1,
    startedAt: start,
    originalSubmittedAt: start,
    configurationSnapshots: {
      businessCalendar: {
        timezone: "Asia/Manila",
        weeklyWindows: [{
          day: "MONDAY",
          start: "08:00",
          end: "17:00"
        }],
        holidays: []
      }
    }
  };
  const pause = {
    clock: "RESOLUTION",
    reason: "WAITING_APPROVAL",
    startedAt: start,
    endedAt: null
  };
  const waiting = cycleElapsed(cycle, [pause], decision);
  assert.equal(waiting.responseElapsedMilliseconds, 2 * 3600000);
  assert.equal(waiting.resolutionElapsedMilliseconds, 0);
  const resumed = cycleElapsed(cycle, [{
    ...pause,
    endedAt: decision
  }], new Date("2026-10-19T03:00:00Z"));
  assert.equal(resumed.responseElapsedMilliseconds, 3 * 3600000);
  assert.equal(resumed.resolutionElapsedMilliseconds, 3600000);
  const rejected = cycleElapsed({
    ...cycle,
    endedAt: decision,
    endReason: "REJECTED"
  }, [{
    ...pause,
    endedAt: decision
  }], new Date("2026-10-20T03:00:00Z"));
  assert.equal(rejected.resolutionTargetEligible, false);
  assert.equal(rejected.responseElapsedMilliseconds, 2 * 3600000);
});
