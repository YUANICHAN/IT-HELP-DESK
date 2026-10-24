import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import path from "node:path";
import mongoose from "mongoose";
import app from "../../src/app.js";
import { createIndexes } from "../../scripts/create-indexes.js";
import { isolatedDatabaseUri } from "./database.js";
import { Organization } from "../../src/modules/organization/organization.model.js";
import { Department } from "../../src/modules/organization/department.model.js";
import { Location } from "../../src/modules/organization/location.model.js";
import { User } from "../../src/modules/users/user.model.js";
import { hashPassword } from "../../src/modules/users/password.service.js";
import { AccessGrant } from "../../src/modules/access/accessGrant.model.js";
import { BusinessCalendar } from "../../src/modules/service-levels/businessCalendar.model.js";
import { SlaPolicy } from "../../src/modules/service-levels/slaPolicy.model.js";
import { ServiceItem } from "../../src/modules/catalog/serviceItem.model.js";
import { Ticket } from "../../src/modules/tickets/ticket.model.js";
import { Asset } from "../../src/modules/assets/asset.model.js";
import { resetAllLoginRateLimits } from "../../src/middleware/rateLimit.js";
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
export async function operationsFixture(label) {
  await mongoose.connect(isolatedDatabaseUri(label));
  const hello = await mongoose.connection.db.admin().command({
    hello: 1
  });
  assert.ok(hello.setName, "Step 6/7 integration tests require TEST_MONGODB_URI pointing to an isolated replica set.");
  await createIndexes();
  resetAllLoginRateLimits();
  const storageRoot = path.resolve("../.tmp", `attachments-${randomUUID()}`);
  process.env.ATTACHMENT_STORAGE_ROOT = storageRoot;
  const org = await Organization.create({
    name: "Synthetic Operations",
    organizationType: "COMPANY",
    supportEmail: "help@synthetic.example"
  });
  const foreignOrg = await Organization.create({
    name: "Foreign Operations",
    organizationType: "COMPANY",
    supportEmail: "help@foreign.example"
  });
  const dept = await Department.create({
    organization: org._id,
    code: "OPS",
    name: "Operations"
  });
  const otherDept = await Department.create({
    organization: org._id,
    code: "FIN",
    name: "Finance"
  });
  const foreignDept = await Department.create({
    organization: foreignOrg._id,
    code: "EXT",
    name: "External"
  });
  const location = await Location.create({
    organization: org._id,
    department: dept._id,
    code: "OPS1",
    name: "Operations floor"
  });
  const otherLocation = await Location.create({
    organization: org._id,
    department: otherDept._id,
    code: "FIN1",
    name: "Finance floor"
  });
  const hash = await hashPassword("Synthetic-Test-Password-67!");
  const users = {};
  for (const [name, role, department, organization] of [["employee", "EMPLOYEE", dept, org], ["peer", "EMPLOYEE", dept, org], ["other", "EMPLOYEE", otherDept, org], ["tech", "TECHNICIAN", dept, org], ["tech2", "TECHNICIAN", dept, org], ["triage", "SUPERVISOR", dept, org], ["supervisor", "SUPERVISOR", dept, org], ["admin", "ADMINISTRATOR", dept, org], ["foreign", "EMPLOYEE", foreignDept, foreignOrg]]) {
    users[name] = await User.create({
      organization: organization._id,
      department: department._id,
      displayName: name,
      email: `${name}@synthetic.example`,
      passwordHash: hash,
      role,
      accountStatus: "ACTIVE",
      mustChangePassword: false
    });
  }
  const grants = {};
  for (const [name, capability, department] of [["tech", "support", dept], ["tech2", "support", dept], ["triage", "ticket_triage", dept], ["triage", "asset_manage", dept], ["supervisor", "department_supervise", dept]]) grants[`${name}:${capability}`] = await AccessGrant.create({
    organization: org._id,
    user: users[name]._id,
    capability,
    department: department._id,
    grantedBy: users.admin._id
  });
  const calendar = await BusinessCalendar.create({
    organization: org._id,
    name: "Business calendar",
    timezone: "Asia/Manila",
    weeklyWindows: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(day => ({
      day,
      start: "08:00",
      end: "17:00"
    })),
    holidays: [{
      date: "2026-12-25",
      name: "Holiday"
    }]
  });
  const policy = await SlaPolicy.create({
    organization: org._id,
    name: "Policy",
    businessCalendar: calendar._id,
    targets: {
      P1: {
        responseMinutes: 15,
        resolutionMinutes: 60
      },
      P2: {
        responseMinutes: 30,
        resolutionMinutes: 240
      }
    }
  });
  const service = await ServiceItem.create({
    organization: org._id,
    code: "INC",
    name: "Equipment help",
    ticketType: "INCIDENT",
    slaPolicy: policy._id,
    assetPolicy: "OWN_OR_SHARED_DEPARTMENT"
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/v1`,
    auth = {};
  async function request(url, {
    actor = "employee",
    method = "GET",
    body,
    key,
    headers = {},
    form,
    raw = false
  } = {}) {
    const session = auth[actor];
    const response = await fetch(`${base}${url}`, {
      method,
      headers: {
        Origin: "http://127.0.0.1:5000",
        ...(session ? {
          Cookie: session.cookie,
          "X-CSRF-Token": session.csrf
        } : {}),
        ...(key ? {
          "Idempotency-Key": key
        } : {}),
        ...(body ? {
          "Content-Type": "application/json"
        } : {}),
        ...headers
      },
      body: form || (body ? JSON.stringify(body) : undefined)
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      status: response.status,
      headers: response.headers,
      body: raw ? buffer : buffer.length ? JSON.parse(buffer.toString()) : null
    };
  }
  for (const [name, user] of Object.entries(users)) {
    const response = await request("/auth/login", {
      actor: null,
      method: "POST",
      body: {
        email: user.email,
        password: "Synthetic-Test-Password-67!"
      }
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    auth[name] = {
      cookie: response.headers.get("set-cookie").split(";")[0],
      csrf: response.body.data.csrfToken
    };
  }
  const post = (url, actor, body, key = randomUUID()) => request(url, {
    method: "POST",
    actor,
    body,
    key
  });
  async function ticket(actor = "employee", overrides = {}) {
    const response = await post("/tickets", actor, {
      serviceItemId: service.id,
      title: "Synthetic equipment incident",
      description: "Synthetic equipment issue for isolated integration tests.",
      urgency: "HIGH",
      locationId: actor === "other" ? otherLocation.id : location.id,
      ...overrides
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body.data.ticket;
  }
  async function asset(overrides = {}) {
    const response = await post("/assets", "triage", {
      assetTag: `SYN-${randomUUID()}`,
      category: "LAPTOP",
      departmentId: dept.id,
      locationId: location.id,
      ...overrides
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    return response.body.data.asset;
  }
  async function command(id, action, actor, body = {}, key = randomUUID()) {
    const current = await Ticket.findById(id);
    return post(`/tickets/${id}/${action}`, actor, {
      expectedVersion: current.version,
      ...body
    }, key);
  }
  async function assetCommand(id, action, body = {}, actor = "triage", key = randomUUID()) {
    const current = await Asset.findById(id);
    return post(`/assets/${id}/${action}`, actor, {
      expectedVersion: current.version,
      ...body
    }, key);
  }
  async function upload(id, {
    actor = "employee",
    buffer = PNG,
    filename = "image.png",
    mime = "image/png",
    visibility = "PUBLIC",
    commentId,
    expectedVersion,
    key = randomUUID()
  } = {}) {
    const ticket = await Ticket.findById(id),
      form = new FormData();
    form.set("expectedVersion", String(expectedVersion ?? ticket.version));
    form.set("visibility", visibility);
    if (commentId) form.set("commentId", commentId);
    form.set("file", new Blob([buffer], {
      type: mime
    }), filename);
    return request(`/tickets/${id}/attachments`, {
      method: "POST",
      actor,
      form,
      key
    });
  }
  return {
    org,
    foreignOrg,
    dept,
    otherDept,
    foreignDept,
    location,
    otherLocation,
    users,
    auth,
    grants,
    calendar,
    policy,
    service,
    storageRoot,
    request,
    post,
    ticket,
    asset,
    command,
    assetCommand,
    upload,
    async close() {
      await new Promise(resolve => server.close(resolve));
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      delete process.env.ATTACHMENT_STORAGE_ROOT;
      resetAllLoginRateLimits();
    }
  };
}
