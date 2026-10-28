import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import mongoose from "mongoose";
import { AccessGrant } from "../src/modules/access/accessGrant.model.js";
import { AuthenticationAudit } from "../src/modules/auth/authenticationAudit.model.js";
import { inspectBackupEvidence, inspectPrivateStorage } from "../src/modules/health/operationsEvidence.service.js";
import { SlaCycle } from "../src/modules/service-levels/slaCycle.model.js";
import { Ticket } from "../src/modules/tickets/ticket.model.js";
import { TicketEvent } from "../src/modules/tickets/ticketEvent.model.js";
import { User } from "../src/modules/users/user.model.js";
import { operationsFixture } from "./support/operations.js";

function data(response, expected = 200) {
  assert.equal(response.status, expected, JSON.stringify(response.body));
  return response.body?.data;
}

test("Step 11 authorized dashboards, reports, audit, and health evidence", async (context) => {
  const fixture = await operationsFixture("summaries");
  try {
    const employeeTicket = await fixture.ticket("employee");
    const peerTicket = await fixture.ticket("peer");
    await fixture.ticket("other");

    await context.test("role dashboards use permitted records without overlap or assignment bypass", async () => {
      let employee = data(await fixture.request("/dashboard", { actor: "employee" })).dashboard;
      assert.equal(employee.sections.personal.activeTickets, 1);
      assert.equal(employee.sections.personal.awaitingConfirmation, 0);

      await Ticket.updateOne(
        { _id: peerTicket.id },
        { $set: { assignee: fixture.users.tech2._id, status: "OPEN" } },
      );
      const technician = data(await fixture.request("/dashboard", { actor: "tech" })).dashboard;
      assert.equal(technician.sections.technician.assignedActive, 0);
      assert.equal(technician.sections.technician.eligibleUnassigned, 1);

      fixture.grants["supervisor:ticket_triage"] = await AccessGrant.create({
        organization: fixture.org._id,
        user: fixture.users.supervisor._id,
        capability: "ticket_triage",
        department: fixture.dept._id,
        grantedBy: fixture.users.admin._id,
      });
      const supervisor = data(await fixture.request("/dashboard", { actor: "supervisor" })).dashboard;
      assert.equal(supervisor.sections.departmentSupervision.backlog.openBacklog, 2);
      assert.equal(supervisor.sections.triage.backlog.openBacklog, 2);
      const overview = data(await fixture.request("/reports/overview", { actor: "supervisor" })).report;
      assert.equal(overview.backlog.openBacklog, 2);

      const administrator = data(await fixture.request("/dashboard", { actor: "admin" })).dashboard;
      assert.ok(administrator.sections.administration);
      assert.equal(Object.hasOwn(administrator.sections, "personal"), false);
      const adminReport = data(await fixture.request("/reports/overview", { actor: "admin" })).report;
      assert.equal(adminReport.backlog.openBacklog, 0);
      assert.equal(adminReport.serviceLevels.resolutionTargetAttainment.percentage, null);

      assert.equal((await fixture.request(
        `/reports/overview?departmentId=${fixture.otherDept.id}`,
        { actor: "tech" },
      )).status, 403);

      await User.collection.updateOne(
        { _id: fixture.users.employee._id },
        { $set: { department: fixture.otherDept._id } },
      );
      employee = data(await fixture.request("/dashboard", { actor: "employee" })).dashboard;
      assert.equal(employee.sections.personal.activeTickets, 1);
      assert.equal(String((await Ticket.findById(employeeTicket.id)).requesterDepartment), fixture.dept.id);
      await User.collection.updateOne(
        { _id: fixture.users.employee._id },
        { $set: { department: fixture.dept._id } },
      );
    });

    await context.test("revoked grants affect the next request", async () => {
      assert.ok(data(await fixture.request("/dashboard", { actor: "triage" })).dashboard.sections.triage);
      await AccessGrant.updateOne(
        { _id: fixture.grants["triage:ticket_triage"]._id },
        { $set: { isActive: false, revokedAt: new Date(), revokedBy: fixture.users.admin._id } },
      );
      const after = data(await fixture.request("/dashboard", { actor: "triage" })).dashboard;
      assert.equal(Object.hasOwn(after.sections, "triage"), false);
      await AccessGrant.updateOne(
        { _id: fixture.grants["triage:ticket_triage"]._id },
        { $set: { isActive: true }, $unset: { revokedAt: "", revokedBy: "" } },
      );
    });

    await context.test("resolved backlog, attainment exclusions, and reopenings follow definitions", async () => {
      const endedAt = new Date("2026-10-26T00:30:00.000Z");
      const starts = new Date("2026-10-26T00:00:00.000Z");
      const eligible = [employeeTicket];
      for (let index = 0; index < 3; index += 1) eligible.push(await fixture.ticket("employee"));
      for (let index = 0; index < eligible.length; index += 1) {
        const late = index === eligible.length - 1;
        const cycleEnd = late ? new Date("2026-10-26T02:00:00.000Z") : endedAt;
        await Ticket.updateOne(
          { _id: eligible[index].id },
          {
            $set: {
              status: "RESOLVED",
              firstResponseAt: new Date("2026-10-26T00:15:00.000Z"),
              resolution: {
                summary: "Synthetic reporting resolution",
                code: "FIXED",
                resolvedBy: fixture.users.tech._id,
                resolvedAt: cycleEnd,
              },
            },
          },
        );
        await SlaCycle.collection.updateOne(
          { ticket: new mongoose.Types.ObjectId(eligible[index].id), cycleNumber: 1 },
          {
            $set: {
              startedAt: starts,
              originalSubmittedAt: starts,
              firstResponseAt: new Date("2026-10-26T00:15:00.000Z"),
              responseBudgetSeconds: 1800,
              resolutionBudgetSeconds: 3600,
              endedAt: cycleEnd,
              endReason: "RESOLVED",
              isOpen: false,
            },
          },
        );
      }
      for (const endReason of ["CANCELLED", "REJECTED"]) {
        const ticket = await fixture.ticket("employee");
        await Ticket.updateOne({ _id: ticket.id }, { $set: { status: endReason } });
        await SlaCycle.collection.updateOne(
          { ticket: new mongoose.Types.ObjectId(ticket.id), cycleNumber: 1 },
          { $set: { startedAt: starts, originalSubmittedAt: starts, endedAt, endReason, isOpen: false } },
        );
      }
      await TicketEvent.create([
        { organization: fixture.org._id, ticket: eligible[0].id, actor: fixture.users.employee._id, type: "REOPENED", occurredAt: endedAt, data: {} },
        { organization: fixture.org._id, ticket: eligible[0].id, actor: fixture.users.employee._id, type: "REOPENED", occurredAt: new Date("2026-10-26T00:31:00Z"), data: {} },
        { organization: fixture.org._id, ticket: eligible[1].id, actor: fixture.users.employee._id, type: "REOPENED", occurredAt: new Date("2026-10-26T00:32:00Z"), data: {} },
      ]);
      const query = "/reports/overview?from=2026-10-25T00:00:00Z&to=2026-10-27T00:00:00Z";
      const report = data(await fixture.request(query, { actor: "employee" })).report;
      assert.equal(report.backlog.awaitingConfirmation, 4);
      assert.equal(report.backlog.openBacklog, 0);
      assert.equal(report.serviceLevels.resolutionTargetAttainment.numerator, 3);
      assert.equal(report.serviceLevels.resolutionTargetAttainment.denominator, 4);
      assert.equal(report.serviceLevels.resolutionTargetAttainment.percentage, 75);
      assert.deepEqual(report.serviceLevels.resolutionTargetAttainment.excludedOutcomes, {
        cancelled: 1,
        rejected: 1,
      });
      assert.equal(report.reopenings.events, 3);
      assert.equal(report.reopenings.distinctTickets, 2);
      assert.equal(report.serviceLevels.resolutionTime.unit, "business_seconds");
    });

    await context.test("audit explorer is narrow, stable, validated, and redacted", async () => {
      await AuthenticationAudit.create({
        eventType: "AUTHENTICATION_REJECTED",
        outcome: "FAILURE",
        reasonCode: "INVALID_CREDENTIALS",
        organization: fixture.org._id,
        user: fixture.users.employee._id,
        ipAddress: "192.0.2.10",
        client: { browser: "Test", operatingSystem: "Test", deviceType: "desktop" },
      });
      const audit = data(await fixture.request(
        "/admin/audit?action=AUTHENTICATION_REJECTED&entityType=USER&sort=desc",
        { actor: "admin" },
      ));
      assert.ok(audit.events.length >= 1);
      assert.equal(audit.events[0].source, "AUTHENTICATION");
      assert.equal(audit.events[0].entity.type, "USER");
      assert.equal(JSON.stringify(audit).includes("192.0.2.10"), false);
      assert.equal(JSON.stringify(audit).toLowerCase().includes("passwordhash"), false);
      const combined = data(await fixture.request(
        "/admin/audit?action=AUTHENTICATION_REJECTED&source=AUTHENTICATION",
        { actor: "admin" },
      ));
      assert.ok(combined.events.every((event) => event.action === "AUTHENTICATION_REJECTED"));
      assert.equal((await fixture.request("/admin/audit?action=TICKET_CREATED", { actor: "admin" })).status, 400);
      assert.equal((await fixture.request("/admin/audit", { actor: "employee" })).status, 403);
    });

    await context.test("backup and storage evidence reports missing, malformed, stale, and inaccessible states", async () => {
      const directory = await mkdtemp(path.join(tmpdir(), "help-desk-health-"));
      try {
        const manifest = path.join(directory, "backup.json");
        assert.equal((await inspectBackupEvidence({ manifestPath: path.join(directory, "missing.json") })).status, "unknown");
        await writeFile(manifest, "not-json");
        assert.equal((await inspectBackupEvidence({ manifestPath: manifest })).diagnosticCode, "BACKUP_MANIFEST_MALFORMED");
        await writeFile(manifest, JSON.stringify({
          schemaVersion: 1,
          latestAttempt: {
            startedAt: "2026-10-25T00:00:00.000Z",
            completedAt: "2026-10-25T00:10:00.000Z",
            outcome: "SUCCESS",
          },
          lastSuccessfulBackup: {
            completedAt: "2026-10-25T00:10:00.000Z",
            coverage: { database: true, privateAttachments: true },
          },
          lastVerifiedRestore: null,
        }));
        const stale = await inspectBackupEvidence({
          manifestPath: manifest,
          maximumAgeHours: 24,
          at: new Date("2026-10-28T00:00:00.000Z"),
        });
        assert.equal(stale.status, "degraded");
        assert.equal(stale.diagnosticCode, "BACKUP_EVIDENCE_STALE");
        const ordinaryFile = path.join(directory, "not-a-directory");
        await writeFile(ordinaryFile, "file");
        assert.equal((await inspectPrivateStorage({ root: ordinaryFile })).status, "unavailable");
        const previousStorageRoot = process.env.ATTACHMENT_STORAGE_ROOT;
        try {
          process.env.ATTACHMENT_STORAGE_ROOT = path.resolve("public");
          const invalidConfiguration = await inspectPrivateStorage();
          assert.equal(invalidConfiguration.status, "unavailable");
          assert.equal(invalidConfiguration.diagnosticCode, "STORAGE_CONFIGURATION_INVALID");
        } finally {
          process.env.ATTACHMENT_STORAGE_ROOT = previousStorageRoot;
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
      const health = data(await fixture.request("/admin/health", { actor: "admin" }));
      assert.equal(health.database.status, "healthy");
      assert.equal(health.worker.status, "unknown");
      assert.ok(["healthy", "unavailable"].includes(health.storage.status));
      assert.equal(health.backup.status, "not-configured");
    });
  } finally {
    await fixture.close();
  }
});
