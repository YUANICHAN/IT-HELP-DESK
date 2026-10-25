import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import mongoose from "mongoose";
import app from "../src/app.js";
import { resetAllLoginRateLimits } from "../src/middleware/rateLimit.js";
import { AccessGrant } from "../src/modules/access/accessGrant.model.js";
import { AuthenticationAudit } from "../src/modules/auth/authenticationAudit.model.js";
import { Session } from "../src/modules/auth/session.model.js";
import { ServiceItem } from "../src/modules/catalog/serviceItem.model.js";
import { Location } from "../src/modules/organization/location.model.js";
import { Department } from "../src/modules/organization/department.model.js";
import { Organization } from "../src/modules/organization/organization.model.js";
import { OutboxEvent } from "../src/modules/outbox/outboxEvent.model.js";
import { BusinessCalendar } from "../src/modules/service-levels/businessCalendar.model.js";
import { SlaCycle } from "../src/modules/service-levels/slaCycle.model.js";
import { SlaPolicy } from "../src/modules/service-levels/slaPolicy.model.js";
import { Ticket } from "../src/modules/tickets/ticket.model.js";
import { TicketComment } from "../src/modules/tickets/ticketComment.model.js";
import { TicketCounter } from "../src/modules/tickets/ticketCounter.model.js";
import { TicketEvent } from "../src/modules/tickets/ticketEvent.model.js";
import { User } from "../src/modules/users/user.model.js";
import { hashPassword } from "../src/modules/users/password.service.js";
import { IdempotencyKey } from "../src/shared/database/idempotencyKey.model.js";
import { isolatedDatabaseUri } from "./support/database.js";
import { randomUUID } from "node:crypto";

const ORIGIN = "http://127.0.0.1:5000";
const PASSWORD = "Ticket-Workflow-Test-1!";

function cookieValue(setCookie) {
  return setCookie?.split(";", 1)[0] || null;
}

async function synchronizeIndexes() {
  await Promise.all([
    Organization.syncIndexes(),
    Department.syncIndexes(),
    Location.syncIndexes(),
    User.syncIndexes(),
    AccessGrant.syncIndexes(),
    Session.syncIndexes(),
    AuthenticationAudit.syncIndexes(),
    BusinessCalendar.syncIndexes(),
    SlaPolicy.syncIndexes(),
    ServiceItem.syncIndexes(),
    Ticket.syncIndexes(),
    TicketCounter.syncIndexes(),
    TicketComment.syncIndexes(),
    TicketEvent.syncIndexes(),
    SlaCycle.syncIndexes(),
    OutboxEvent.syncIndexes(),
    IdempotencyKey.syncIndexes(),
  ]);
}

test("first ticket workflow HTTP integration", async (context) => {
  const databaseUri = isolatedDatabaseUri("ticket");
  await mongoose.connect(databaseUri);
  await synchronizeIndexes();

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(
    path,
    { method = "GET", body, auth, idempotencyKey, origin = ORIGIN } = {},
  ) {
    const headers = {};
    if (origin) headers.Origin = origin;
    if (auth?.cookie) headers.Cookie = auth.cookie;
    if (auth?.csrfToken) headers["X-CSRF-Token"] = auth.csrfToken;
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
      headers: response.headers,
    };
  }

  async function login(user) {
    const response = await request("/api/v1/auth/login", {
      method: "POST",
      body: { email: user.email, password: PASSWORD },
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return {
      cookie: cookieValue(response.headers.get("set-cookie")),
      csrfToken: response.body.data.csrfToken,
    };
  }

  async function post(path, auth, body, idempotencyKey) {
    if (/\/(start|comments)$/u.test(path)) {
      idempotencyKey ||= randomUUID();
      if (body.expectedVersion === undefined && path.endsWith("/comments")) {
        const ticket = await Ticket.findById(path.split("/").at(-2));
        body = { ...body, expectedVersion: ticket.version };
      }
    }
    return request(path, { method: "POST", auth, body, idempotencyKey });
  }

  try {
    const hash = await hashPassword(PASSWORD);
    const organization = await Organization.create({
      name: "Ticket Workflow Company",
      organizationType: "COMPANY",
      supportEmail: "support@ticket-test.example",
    });
    const foreignOrganization = await Organization.create({
      name: "Foreign Ticket Company",
      organizationType: "COMPANY",
      supportEmail: "support@foreign-ticket.example",
    });
    const departmentA = await Department.create({
      organization: organization._id,
      code: "OPS",
      name: "Operations",
    });
    const departmentB = await Department.create({
      organization: organization._id,
      code: "FIN",
      name: "Finance",
    });
    const foreignDepartment = await Department.create({
      organization: foreignOrganization._id,
      code: "OPS",
      name: "Foreign Operations",
    });
    const locationA = await Location.create({
      organization: organization._id,
      department: departmentA._id,
      code: "OPS-1",
      name: "Operations Floor",
    });
    const locationB = await Location.create({
      organization: organization._id,
      department: departmentB._id,
      code: "FIN-1",
      name: "Finance Floor",
    });

    async function makeUser(name, email, role, department = departmentA, org = organization) {
      return User.create({
        organization: org._id,
        department: department._id,
        displayName: name,
        email,
        passwordHash: hash,
        role,
        accountStatus: "ACTIVE",
        mustChangePassword: false,
      });
    }

    const administrator = await makeUser(
      "Ticket Administrator",
      "admin@ticket-test.example",
      "ADMINISTRATOR",
    );
    const employeeA = await makeUser(
      "Operations Requester",
      "ops.requester@ticket-test.example",
      "EMPLOYEE",
    );
    const employeePeer = await makeUser(
      "Operations Peer",
      "ops.peer@ticket-test.example",
      "EMPLOYEE",
    );
    const employeeB = await makeUser(
      "Finance Requester",
      "finance.requester@ticket-test.example",
      "EMPLOYEE",
      departmentB,
    );
    const technicianA = await makeUser(
      "Operations Technician",
      "tech.a@ticket-test.example",
      "TECHNICIAN",
    );
    const technicianB = await makeUser(
      "Competing Technician",
      "tech.b@ticket-test.example",
      "TECHNICIAN",
    );
    const supervisor = await makeUser(
      "Operations Supervisor",
      "supervisor@ticket-test.example",
      "SUPERVISOR",
    );
    const triageSupervisor = await makeUser(
      "Organization Triage",
      "triage@ticket-test.example",
      "SUPERVISOR",
    );
    await makeUser(
      "Foreign Employee",
      "employee@foreign-ticket.example",
      "EMPLOYEE",
      foreignDepartment,
      foreignOrganization,
    );

    const supportGrantA = await AccessGrant.create({
      organization: organization._id,
      user: technicianA._id,
      capability: "support",
      department: departmentA._id,
      grantedBy: administrator._id,
    });
    await AccessGrant.create({
      organization: organization._id,
      user: technicianB._id,
      capability: "support",
      department: departmentA._id,
      grantedBy: administrator._id,
    });
    await AccessGrant.create({
      organization: organization._id,
      user: supervisor._id,
      capability: "department_supervise",
      department: departmentA._id,
      grantedBy: administrator._id,
    });
    await AccessGrant.create({
      organization: organization._id,
      user: triageSupervisor._id,
      capability: "ticket_triage",
      department: null,
      grantedBy: administrator._id,
    });

    const calendar = await BusinessCalendar.create({
      organization: organization._id,
      name: "Manila Business Hours",
      timezone: "Asia/Manila",
      weeklyWindows: [
        { day: "MONDAY", start: "08:00", end: "17:00" },
        { day: "TUESDAY", start: "08:00", end: "17:00" },
      ],
      holidays: [{ date: "2026-12-25", name: "Christmas Day" }],
    });
    const policy = await SlaPolicy.create({
      organization: organization._id,
      name: "Standard Support",
      businessCalendar: calendar._id,
      targets: {
        P2: { responseMinutes: 30, resolutionMinutes: 240 },
        P3: { responseMinutes: 60, resolutionMinutes: 480 },
        P4: { responseMinutes: 240, resolutionMinutes: 1440 },
      },
    });
    const foreignCalendar = await BusinessCalendar.create({
      organization: foreignOrganization._id,
      name: "Foreign Business Hours",
      timezone: "Asia/Manila",
      weeklyWindows: [],
      holidays: [],
    });
    const foreignPolicy = await SlaPolicy.create({
      organization: foreignOrganization._id,
      name: "Foreign Policy",
      businessCalendar: foreignCalendar._id,
      targets: { P3: { responseMinutes: 60, resolutionMinutes: 480 } },
    });
    await assert.rejects(
      ServiceItem.create({
        organization: organization._id,
        code: "INVALID-CROSS-ORG",
        name: "Invalid Cross Organization Service",
        ticketType: "INCIDENT",
        slaPolicy: foreignPolicy._id,
      }),
      /same organization/u,
    );
    const incidentService = await ServiceItem.create({
      organization: organization._id,
      code: "INC-GENERAL",
      name: "General Incident",
      description: "General incident support",
      ticketType: "INCIDENT",
      requiresApproval: false,
      slaPolicy: policy._id,
      configuration: { channel: "PORTAL", formVersion: 1 },
    });
    const requestService = await ServiceItem.create({
      organization: organization._id,
      code: "REQ-ACCESS",
      name: "Access Request",
      ticketType: "REQUEST",
      requiresApproval: true,
      slaPolicy: policy._id,
      configuration: { approvalPath: "DEPARTMENT" },
    });
    const inactiveService = await ServiceItem.create({
      organization: organization._id,
      code: "INC-OLD",
      name: "Retired Incident",
      ticketType: "INCIDENT",
      requiresApproval: false,
      slaPolicy: policy._id,
      isActive: false,
    });

    resetAllLoginRateLimits();
    const [employeeAuth, peerAuth, financeAuth, techAAuth, techBAuth, supervisorAuth, triageAuth, adminAuth] =
      await Promise.all([
        login(employeeA),
        login(employeePeer),
        login(employeeB),
        login(technicianA),
        login(technicianB),
        login(supervisor),
        login(triageSupervisor),
        login(administrator),
      ]);

    await context.test("health and request security remain operational", async () => {
      const health = await request("/api/v1/health", { origin: null });
      assert.equal(health.status, 200);
      assert.equal(health.body.data.database, "connected");

      const missingCsrf = await request("/api/v1/tickets", {
        method: "POST",
        auth: { cookie: employeeAuth.cookie },
        idempotencyKey: "missing-csrf-0001",
        body: {
          serviceItemId: incidentService.id,
          title: "Printer is unavailable",
          description: "The operations printer does not respond to print jobs.",
          urgency: "MEDIUM",
        },
      });
      assert.equal(missingCsrf.status, 403);
      assert.equal(missingCsrf.body.error.code, "CSRF_VALIDATION_FAILED");

      const foreignOrigin = await request("/api/v1/tickets", {
        method: "POST",
        auth: employeeAuth,
        origin: "https://attacker.example",
        idempotencyKey: "foreign-origin-01",
        body: {
          serviceItemId: incidentService.id,
          title: "Printer is unavailable",
          description: "The operations printer does not respond to print jobs.",
          urgency: "MEDIUM",
        },
      });
      assert.equal(foreignOrigin.status, 403);
      assert.equal(foreignOrigin.body.error.code, "ORIGIN_NOT_ALLOWED");
    });

    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName) {
      await context.test("standalone MongoDB refuses partial ticket writes", async () => {
        const response = await post(
          "/api/v1/tickets",
          employeeAuth,
          {
            serviceItemId: incidentService.id,
            title: "Printer is unavailable",
            description: "The operations printer does not respond to print jobs.",
            urgency: "MEDIUM",
          },
          "standalone-create-01",
        );
        assert.equal(response.status, 503);
        assert.equal(response.body.error.code, "TRANSACTIONS_UNAVAILABLE");
        assert.equal(await Ticket.countDocuments(), 0);
      });
      context.diagnostic(
        "Full ticket mutation tests require TEST_MONGODB_URI to reference a MongoDB replica set.",
      );
      return;
    }

    const createBody = {
      serviceItemId: incidentService.id,
      title: "Operations printer is unavailable",
      description: "The shared operations printer does not respond to any submitted print jobs.",
      urgency: "HIGH",
      locationId: locationA.id,
    };
    let workflowTicket;

    await context.test("creation validates protected inputs and unsupported prerequisites", async () => {
      const forged = await post(
        "/api/v1/tickets",
        employeeAuth,
        { ...createBody, status: "CLOSED" },
        "forged-create-001",
      );
      assert.equal(forged.status, 400);

      const wrongLocation = await post(
        "/api/v1/tickets",
        employeeAuth,
        { ...createBody, locationId: locationB.id },
        "wrong-location-01",
      );
      assert.equal(wrongLocation.status, 422);
      assert.equal(wrongLocation.body.error.code, "LOCATION_UNAVAILABLE");

      const assetSelection = await post(
        "/api/v1/tickets",
        employeeAuth,
        { ...createBody, assetIds: [new mongoose.Types.ObjectId().toString()] },
        "asset-unsupported",
      );
      assert.equal(assetSelection.status, 422);
      assert.equal(assetSelection.body.error.code, "ASSET_SELECTION_UNAVAILABLE");

      const before = await Ticket.countDocuments();
      const approval = await post(
        "/api/v1/tickets",
        employeeAuth,
        { ...createBody, serviceItemId: requestService.id },
        "approval-blocked-1",
      );
      assert.equal(approval.status, 409);
      assert.equal(approval.body.error.code, "APPROVER_CONFIGURATION_REQUIRED");
      assert.equal(await Ticket.countDocuments(), before);

      const inactive = await post(
        "/api/v1/tickets",
        employeeAuth,
        { ...createBody, serviceItemId: inactiveService.id },
        "inactive-service1",
      );
      assert.equal(inactive.status, 422);
      assert.equal(inactive.body.error.code, "SERVICE_ITEM_UNAVAILABLE");
    });

    await context.test("creation snapshots configuration and is idempotent", async () => {
      const created = await post(
        "/api/v1/tickets",
        employeeAuth,
        createBody,
        "workflow-create-01",
      );
      assert.equal(created.status, 201, JSON.stringify(created.body));
      workflowTicket = created.body.data.ticket;
      assert.match(workflowTicket.reference, /^TKT-\d{4}-000001$/u);
      assert.equal(workflowTicket.status, "NEW");
      assert.equal(workflowTicket.priority, "P2");
      assert.equal(workflowTicket.impact, "MEDIUM");
      assert.equal(workflowTicket.type, "INCIDENT");
      assert.equal(workflowTicket.version, 0);

      const replayed = await post(
        "/api/v1/tickets",
        employeeAuth,
        createBody,
        "workflow-create-01",
      );
      assert.equal(replayed.status, 201);
      assert.equal(replayed.headers.get("idempotency-replayed"), "true");
      assert.equal(replayed.body.data.ticket.id, workflowTicket.id);

      const changedInput = await post(
        "/api/v1/tickets",
        employeeAuth,
        { ...createBody, title: "A different incident title" },
        "workflow-create-01",
      );
      assert.equal(changedInput.status, 409);
      assert.equal(changedInput.body.error.code, "IDEMPOTENCY_KEY_REUSED");

      const stored = await Ticket.findById(workflowTicket.id).lean();
      assert.equal(stored.requester.toString(), employeeA.id);
      assert.equal(stored.requesterDepartment.toString(), departmentA.id);
      assert.equal(stored.configurationSnapshots.service.configuration.formVersion, 1);
      assert.equal(stored.configurationSnapshots.slaPolicy.targets.P2.responseMinutes, 30);
      assert.equal(stored.configurationSnapshots.businessCalendar.holidays[0].name, "Christmas Day");
      assert.equal(Object.hasOwn(stored, "dueAt"), false);
      assert.equal(await SlaCycle.countDocuments({ ticket: stored._id }), 1);
      assert.equal(await TicketEvent.countDocuments({ ticket: stored._id, type: "CREATED" }), 1);
      assert.equal(await OutboxEvent.countDocuments({ aggregateId: stored._id, status: "PENDING" }), 1);
      assert.equal(await AuthenticationAudit.countDocuments({ ticket: stored._id, eventType: "TICKET_CREATED" }), 1);
    });

    await context.test("visibility filters apply to lists, detail, comments, and events", async () => {
      const requesterList = await request("/api/v1/tickets?search=operations%20printer", {
        auth: employeeAuth,
      });
      assert.equal(requesterList.status, 200);
      assert.equal(requesterList.body.data.pagination.total, 1);

      for (const auth of [peerAuth, adminAuth]) {
        const list = await request("/api/v1/tickets?search=operations%20printer", { auth });
        assert.equal(list.status, 200);
        assert.equal(list.body.data.pagination.total, 0);
        assert.equal((await request(`/api/v1/tickets/${workflowTicket.id}`, { auth })).status, 404);
        assert.equal(
          (await request(`/api/v1/tickets/${workflowTicket.id}/comments`, { auth })).status,
          404,
        );
        assert.equal(
          (await request(`/api/v1/tickets/${workflowTicket.id}/events`, { auth })).status,
          404,
        );
      }

      const queue = await request("/api/v1/queue?status=NEW&limit=25", { auth: techAAuth });
      assert.equal(queue.status, 200);
      assert.equal(queue.body.data.pagination.total, 1);
      assert.equal(queue.body.data.tickets[0].id, workflowTicket.id);

      const supervised = await request(`/api/v1/tickets/${workflowTicket.id}`, {
        auth: supervisorAuth,
      });
      assert.equal(supervised.status, 200);
      assert.equal(supervised.body.data.ticket.viewer, "SUPERVISOR_PUBLIC");
    });

    await context.test("claim, start, reply, resolve, and requester closure form one coherent journey", async () => {
      const claimed = await post(
        `/api/v1/tickets/${workflowTicket.id}/claim`,
        techAAuth,
        { expectedVersion: 0 },
        "workflow-claim-001",
      );
      assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
      assert.equal(claimed.body.data.ticket.status, "OPEN");
      assert.equal(claimed.body.data.ticket.assignee.id, technicianA.id);
      assert.equal(claimed.body.data.ticket.version, 1);

      const claimReplay = await post(
        `/api/v1/tickets/${workflowTicket.id}/claim`,
        techAAuth,
        { expectedVersion: 0 },
        "workflow-claim-001",
      );
      assert.equal(claimReplay.status, 200);
      assert.equal(claimReplay.headers.get("idempotency-replayed"), "true");

      const staleStart = await post(
        `/api/v1/tickets/${workflowTicket.id}/start`,
        techAAuth,
        { expectedVersion: 0 },
      );
      assert.equal(staleStart.status, 409);
      assert.equal(staleStart.body.error.code, "STALE_TICKET_VERSION");

      const started = await post(
        `/api/v1/tickets/${workflowTicket.id}/start`,
        techAAuth,
        { expectedVersion: 1 },
      );
      assert.equal(started.status, 200);
      assert.equal(started.body.data.ticket.status, "IN_PROGRESS");
      assert.equal(started.body.data.ticket.version, 2);

      const reply = await post(
        `/api/v1/tickets/${workflowTicket.id}/comments`,
        techAAuth,
        { body: "I reproduced the printer failure and am replacing its network configuration." },
      );
      assert.equal(reply.status, 201);
      assert.equal(reply.body.data.comment.visibility, "PUBLIC");
      let afterReply = await Ticket.findById(workflowTicket.id).lean();
      assert.ok(afterReply.firstResponseAt);
      const firstResponse = afterReply.firstResponseAt.getTime();
      assert.equal(afterReply.version, 3);

      const wrongResolver = await post(
        `/api/v1/tickets/${workflowTicket.id}/resolve`,
        techBAuth,
        {
          expectedVersion: 3,
          summary: "This technician is not assigned.",
          resolutionCode: "FIXED",
        },
        "wrong-resolver-01",
      );
      assert.equal(wrongResolver.status, 404);

      const resolved = await post(
        `/api/v1/tickets/${workflowTicket.id}/resolve`,
        techAAuth,
        {
          expectedVersion: 3,
          summary: "Updated the printer network configuration and verified a successful test page.",
          resolutionCode: "FIXED",
        },
        "workflow-resolve-1",
      );
      assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
      assert.equal(resolved.body.data.ticket.status, "RESOLVED");
      assert.equal(resolved.body.data.ticket.version, 4);

      const resolutionReplay = await post(
        `/api/v1/tickets/${workflowTicket.id}/resolve`,
        techAAuth,
        {
          expectedVersion: 3,
          summary: "Updated the printer network configuration and verified a successful test page.",
          resolutionCode: "FIXED",
        },
        "workflow-resolve-1",
      );
      assert.equal(resolutionReplay.status, 200);
      assert.equal(resolutionReplay.headers.get("idempotency-replayed"), "true");

      afterReply = await Ticket.findById(workflowTicket.id).lean();
      assert.equal(afterReply.firstResponseAt.getTime(), firstResponse);
      const cycle = await SlaCycle.findOne({ ticket: workflowTicket.id }).lean();
      assert.ok(cycle.endedAt);
      assert.equal(cycle.endReason, "RESOLVED");

      const technicianClose = await post(
        `/api/v1/tickets/${workflowTicket.id}/close`,
        techAAuth,
        { expectedVersion: 4 },
        "technician-close1",
      );
      assert.equal(technicianClose.status, 403);

      const closed = await post(
        `/api/v1/tickets/${workflowTicket.id}/close`,
        employeeAuth,
        { expectedVersion: 4 },
        "workflow-close-01",
      );
      assert.equal(closed.status, 200);
      assert.equal(closed.body.data.ticket.status, "CLOSED");
      assert.equal(closed.body.data.ticket.version, 5);

      const closeReplay = await post(
        `/api/v1/tickets/${workflowTicket.id}/close`,
        employeeAuth,
        { expectedVersion: 4 },
        "workflow-close-01",
      );
      assert.equal(closeReplay.status, 200);
      assert.equal(closeReplay.headers.get("idempotency-replayed"), "true");

      const comments = await request(`/api/v1/tickets/${workflowTicket.id}/comments`, {
        auth: employeeAuth,
      });
      assert.equal(comments.status, 200);
      assert.deepEqual(
        comments.body.data.comments.map((comment) => comment.kind),
        ["REPLY", "RESOLUTION"],
      );
      const events = await request(`/api/v1/tickets/${workflowTicket.id}/events`, {
        auth: employeeAuth,
      });
      assert.deepEqual(
        events.body.data.events.map((event) => event.type),
        ["CREATED", "CLAIMED", "WORK_STARTED", "PUBLIC_REPLY_ADDED", "RESOLVED", "CLOSED"],
      );
      assert.equal(JSON.stringify(events.body).includes("passwordHash"), false);
      assert.equal(JSON.stringify(events.body).includes("tokenDigest"), false);

      const commentAfterClose = await post(
        `/api/v1/tickets/${workflowTicket.id}/comments`,
        employeeAuth,
        { body: "This comment must not be accepted after closure." },
      );
      assert.equal(commentAfterClose.status, 409);
      assert.equal(commentAfterClose.body.error.code, "INVALID_TICKET_TRANSITION");
    });

    let crossDepartmentTicket;
    await context.test("cross-user, cross-department, and administrator access stay denied", async () => {
      const created = await post(
        "/api/v1/tickets",
        financeAuth,
        {
          serviceItemId: incidentService.id,
          title: "Finance scanner is unavailable",
          description: "The finance scanner cannot be detected by any workstation in the department.",
          urgency: "LOW",
          locationId: locationB.id,
        },
        "finance-create-01",
      );
      assert.equal(created.status, 201);
      crossDepartmentTicket = created.body.data.ticket;

      for (const auth of [employeeAuth, techAAuth, supervisorAuth, adminAuth]) {
        const detail = await request(`/api/v1/tickets/${crossDepartmentTicket.id}`, { auth });
        assert.equal(detail.status, 404);
      }
      const triage = await request(`/api/v1/tickets/${crossDepartmentTicket.id}`, {
        auth: triageAuth,
      });
      assert.equal(triage.status, 200);
      assert.equal(triage.body.data.ticket.viewer, "STAFF");

      const adminList = await request("/api/v1/tickets", { auth: adminAuth });
      assert.equal(adminList.body.data.pagination.total, 0);
    });

    await context.test("concurrent claims have one winner and stale commands fail", async () => {
      const created = await post(
        "/api/v1/tickets",
        employeeAuth,
        {
          serviceItemId: incidentService.id,
          title: "Wireless access point repeatedly restarts",
          description: "The operations wireless access point restarts every few minutes and drops connections.",
          urgency: "MEDIUM",
        },
        "concurrent-create1",
      );
      assert.equal(created.status, 201);
      const id = created.body.data.ticket.id;
      const [first, second] = await Promise.all([
        post(`/api/v1/tickets/${id}/claim`, techAAuth, { expectedVersion: 0 }, "claim-race-tech-a"),
        post(`/api/v1/tickets/${id}/claim`, techBAuth, { expectedVersion: 0 }, "claim-race-tech-b"),
      ]);
      assert.deepEqual([first.status, second.status].sort(), [200, 409]);
      assert.equal(await TicketEvent.countDocuments({ ticket: id, type: "CLAIMED" }), 1);
      assert.equal(await AuthenticationAudit.countDocuments({ ticket: id, eventType: "TICKET_CLAIMED" }), 1);
    });

    await context.test("scope revocation affects the next request on the same session", async () => {
      const created = await post(
        "/api/v1/tickets",
        employeeAuth,
        {
          serviceItemId: incidentService.id,
          title: "Operations phone has no dial tone",
          description: "The shared operations desk phone has no dial tone after being restarted.",
          urgency: "LOW",
        },
        "revoke-create-01",
      );
      const id = created.body.data.ticket.id;
      assert.equal((await request(`/api/v1/tickets/${id}`, { auth: techAAuth })).status, 200);
      const claimed = await post(
        `/api/v1/tickets/${id}/claim`,
        techAAuth,
        { expectedVersion: 0 },
        "revoke-claim-001",
      );
      assert.equal(claimed.status, 200);
      await AccessGrant.updateOne(
        { _id: supportGrantA._id },
        {
          $set: {
            isActive: false,
            revokedAt: new Date(),
            revokedBy: administrator._id,
          },
        },
      );
      assert.equal((await request(`/api/v1/tickets/${id}`, { auth: techAAuth })).status, 404);
      assert.equal((await request("/api/v1/queue", { auth: techAAuth })).body.data.pagination.total, 0);

      await AccessGrant.create({
        organization: organization._id,
        user: technicianA._id,
        capability: "support",
        department: departmentA._id,
        grantedBy: administrator._id,
      });
      assert.equal((await request(`/api/v1/tickets/${id}`, { auth: techAAuth })).status, 200);
    });

    await context.test("invalid transitions and transaction rollback are coherent", async () => {
      const created = await post(
        "/api/v1/tickets",
        employeeAuth,
        {
          serviceItemId: incidentService.id,
          title: "Meeting room display has no image",
          description: "The operations meeting room display powers on but does not show the connected computer.",
          urgency: "MEDIUM",
        },
        "transition-create",
      );
      const id = created.body.data.ticket.id;
      const claimed = await post(
        `/api/v1/tickets/${id}/claim`,
        techAAuth,
        { expectedVersion: 0 },
        "transition-claim1",
      );
      assert.equal(claimed.status, 200);
      const invalidResolve = await post(
        `/api/v1/tickets/${id}/resolve`,
        techAAuth,
        {
          expectedVersion: 1,
          summary: "Cannot resolve before starting work.",
          resolutionCode: "NO_FAULT_FOUND",
        },
        "invalid-resolve1",
      );
      assert.equal(invalidResolve.status, 409);
      assert.equal(invalidResolve.body.error.code, "INVALID_TICKET_TRANSITION");

      const started = await post(
        `/api/v1/tickets/${id}/start`,
        techAAuth,
        { expectedVersion: 1 },
      );
      assert.equal(started.status, 200);
      const resolution = await post(
        `/api/v1/tickets/${id}/resolve`,
        techAAuth,
        {
          expectedVersion: 2,
          summary: "Reseated the display cable and verified that the room display is working.",
          resolutionCode: "FIXED",
        },
        "first-response-resolution",
      );
      assert.equal(resolution.status, 200);
      const resolvedWithoutReply = await Ticket.findById(id).lean();
      assert.equal(
        resolvedWithoutReply.firstResponseAt.getTime(),
        resolvedWithoutReply.resolution.resolvedAt.getTime(),
      );

      const title = "Audit rollback should remove every business write";
      const counts = {
        tickets: await Ticket.countDocuments(),
        events: await TicketEvent.countDocuments(),
        outbox: await OutboxEvent.countDocuments(),
        keys: await IdempotencyKey.countDocuments(),
      };
      const originalCreate = AuthenticationAudit.create;
      AuthenticationAudit.create = async function failTicketAudit(documents, options) {
        const event = Array.isArray(documents) ? documents[0] : documents;
        if (event?.eventType === "TICKET_CREATED") throw new Error("Injected ticket audit failure");
        return originalCreate.call(this, documents, options);
      };
      let failed;
      try {
        failed = await post(
          "/api/v1/tickets",
          employeeAuth,
          {
            serviceItemId: incidentService.id,
            title,
            description: "This request deliberately injects an audit failure to verify transaction rollback.",
            urgency: "LOW",
          },
          "rollback-create-1",
        );
      } finally {
        AuthenticationAudit.create = originalCreate;
      }
      assert.equal(failed.status, 500);
      assert.equal(await Ticket.countDocuments(), counts.tickets);
      assert.equal(await TicketEvent.countDocuments(), counts.events);
      assert.equal(await OutboxEvent.countDocuments(), counts.outbox);
      assert.equal(await IdempotencyKey.countDocuments(), counts.keys);
      assert.equal(await Ticket.countDocuments({ title }), 0);
    });
  } finally {
    resetAllLoginRateLimits();
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    const databaseName = mongoose.connection.db.databaseName;
    assert.match(databaseName, /^it_help_desk_test_/u);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
