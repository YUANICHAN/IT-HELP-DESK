import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import mongoose from "mongoose";
import app from "../src/app.js";
import { resetAllLoginRateLimits } from "../src/middleware/rateLimit.js";
import { AccessGrant } from "../src/modules/access/accessGrant.model.js";
import {
  buildCapabilityScopeFilter,
  buildSupportScopeFilter,
  hasDepartmentCapability,
  ticketVisibilityPolicy,
} from "../src/modules/access/scopeFilters.js";
import { AuthenticationAudit } from "../src/modules/auth/authenticationAudit.model.js";
import { Session } from "../src/modules/auth/session.model.js";
import { Department } from "../src/modules/organization/department.model.js";
import { Organization } from "../src/modules/organization/organization.model.js";
import { hashPassword } from "../src/modules/users/password.service.js";
import { User } from "../src/modules/users/user.model.js";
import { isolatedDatabaseUri } from "./support/database.js";

const ALLOWED_ORIGIN = "http://127.0.0.1:5000";
const PASSWORD = "Scope-Administration-Test-1!";

function cookieValue(setCookie) {
  return setCookie?.split(";", 1)[0] || null;
}

async function synchronizeIndexes() {
  await Promise.all([
    Organization.syncIndexes(),
    Department.syncIndexes(),
    User.syncIndexes(),
    AccessGrant.syncIndexes(),
    Session.syncIndexes(),
    AuthenticationAudit.syncIndexes(),
  ]);
}

test("scope administration HTTP integration", async (context) => {
  const databaseUri = isolatedDatabaseUri("access");
  await mongoose.connect(databaseUri);
  await synchronizeIndexes();

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function request(
    path,
    {
      method = "GET",
      body,
      cookie,
      csrfToken,
      origin = ALLOWED_ORIGIN,
    } = {},
  ) {
    const headers = {};
    if (origin) headers.Origin = origin;
    if (cookie) headers.Cookie = cookie;
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
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
      setCookie: response.headers.get("set-cookie"),
    };
  }

  async function login(email) {
    const response = await request("/api/v1/auth/login", {
      method: "POST",
      body: { email, password: PASSWORD },
    });

    assert.equal(response.status, 200, JSON.stringify(response.body));
    return {
      cookie: cookieValue(response.setCookie),
      csrfToken: response.body.data.csrfToken,
      data: response.body.data,
    };
  }

  async function postGrant(authentication, payload) {
    return request("/api/v1/admin/access-grants", {
      method: "POST",
      cookie: authentication.cookie,
      csrfToken: authentication.csrfToken,
      body: payload,
    });
  }

  try {
    const passwordHash = await hashPassword(PASSWORD);
    const organization = await Organization.create({
      name: "Scope Administration Test Company",
      organizationType: "COMPANY",
      supportEmail: "support@scope-test.example",
    });
    const otherOrganization = await Organization.create({
      name: "Other Scope Test Company",
      organizationType: "COMPANY",
      supportEmail: "support@other-scope-test.example",
    });
    const recipientDepartment = await Department.create({
      organization: organization._id,
      code: "OPS",
      name: "Operations",
    });
    const otherScopeDepartment = await Department.create({
      organization: organization._id,
      code: "FIN",
      name: "Finance",
    });
    const inactiveDepartment = await Department.create({
      organization: organization._id,
      code: "OLD",
      name: "Inactive Department",
      isActive: false,
    });
    const foreignDepartment = await Department.create({
      organization: otherOrganization._id,
      code: "OPS",
      name: "Foreign Operations",
    });

    async function createUser(
      displayName,
      email,
      role,
      {
        userOrganization = organization,
        department = recipientDepartment,
        accountStatus = "ACTIVE",
      } = {},
    ) {
      return User.create({
        organization: userOrganization._id,
        department: department._id,
        displayName,
        email,
        passwordHash,
        role,
        accountStatus,
        mustChangePassword: false,
      });
    }

    const administrator = await createUser(
      "Scope Administrator",
      "admin@scope-test.example",
      "ADMINISTRATOR",
    );
    const technician = await createUser(
      "Scope Technician",
      "technician@scope-test.example",
      "TECHNICIAN",
    );
    const concurrentTechnician = await createUser(
      "Concurrent Technician",
      "concurrent@scope-test.example",
      "TECHNICIAN",
    );
    const supervisor = await createUser(
      "Scope Supervisor",
      "supervisor@scope-test.example",
      "SUPERVISOR",
    );
    const employee = await createUser(
      "Scope Employee",
      "employee@scope-test.example",
      "EMPLOYEE",
    );
    const inactiveTechnician = await createUser(
      "Inactive Technician",
      "inactive@scope-test.example",
      "TECHNICIAN",
      { accountStatus: "DISABLED" },
    );
    const foreignTechnician = await createUser(
      "Foreign Technician",
      "technician@other-scope-test.example",
      "TECHNICIAN",
      {
        userOrganization: otherOrganization,
        department: foreignDepartment,
      },
    );

    resetAllLoginRateLimits();
    const administratorAuth = await login(administrator.email);
    const employeeAuth = await login(employee.email);
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });

    await context.test("administrator role is required", async () => {
      const unauthenticated = await request("/api/v1/admin/access-grants");
      assert.equal(unauthenticated.status, 401);

      const forbidden = await request("/api/v1/admin/access-grants", {
        cookie: employeeAuth.cookie,
      });
      assert.equal(forbidden.status, 403);
      assert.equal(forbidden.body.error.code, "FORBIDDEN");

      const administratorList = await request(
        "/api/v1/admin/access-grants",
        { cookie: administratorAuth.cookie },
      );
      assert.equal(administratorList.status, 200);

      const missingCsrf = await request("/api/v1/admin/access-grants", {
        method: "POST",
        cookie: administratorAuth.cookie,
        body: {
          userId: technician.id,
          capability: "support",
          departmentId: recipientDepartment.id,
        },
      });
      assert.equal(missingCsrf.status, 403);
      assert.equal(missingCsrf.body.error.code, "CSRF_VALIDATION_FAILED");
    });

    if (!hello.setName) {
      await context.test(
        "standalone MongoDB refuses non-atomic grant writes",
        async () => {
          const response = await postGrant(administratorAuth, {
            userId: technician.id,
            capability: "support",
            departmentId: recipientDepartment.id,
          });
          assert.equal(response.status, 503);
          assert.equal(response.body.error.code, "TRANSACTIONS_UNAVAILABLE");
          assert.equal(await AccessGrant.countDocuments(), 0);
          assert.equal(
            await AuthenticationAudit.countDocuments({
              eventType: "ACCESS_GRANT_CREATED",
            }),
            0,
          );
        },
      );
      context.diagnostic(
        "Full scope-administration mutation tests require TEST_MONGODB_URI to reference a replica set.",
      );
      return;
    }

    await context.test(
      "allowed capability, role, and scope combinations succeed",
      async () => {
        const allowed = [
          {
            userId: technician.id,
            capability: "support",
            departmentId: otherScopeDepartment.id,
          },
          {
            userId: supervisor.id,
            capability: "department_supervise",
            departmentId: recipientDepartment.id,
          },
          {
            userId: supervisor.id,
            capability: "ticket_triage",
            departmentId: null,
          },
          {
            userId: supervisor.id,
            capability: "ticket_triage",
            departmentId: otherScopeDepartment.id,
          },
          {
            userId: technician.id,
            capability: "asset_manage",
            departmentId: null,
          },
          {
            userId: supervisor.id,
            capability: "asset_manage",
            departmentId: otherScopeDepartment.id,
          },
        ];

        for (const payload of allowed) {
          const response = await postGrant(administratorAuth, payload);
          assert.equal(response.status, 201, JSON.stringify(response.body));
        }

        const organizationWide = await AccessGrant.findOne({
          user: technician._id,
          capability: "asset_manage",
        }).lean();
        assert.equal(organizationWide.department, null);

        const support = await AccessGrant.findOne({
          user: technician._id,
          capability: "support",
        });
        assert.equal(
          support.department.toString(),
          otherScopeDepartment.id,
          "A grant may cover a department other than the recipient's own.",
        );
      },
    );

    await context.test(
      "all disallowed role and capability combinations are rejected",
      async () => {
        const rejected = [
          [supervisor, "support"],
          [employee, "support"],
          [administrator, "support"],
          [technician, "department_supervise"],
          [employee, "department_supervise"],
          [administrator, "department_supervise"],
          [technician, "ticket_triage"],
          [employee, "ticket_triage"],
          [administrator, "ticket_triage"],
          [employee, "asset_manage"],
          [administrator, "asset_manage"],
        ];

        for (const [recipient, capability] of rejected) {
          const response = await postGrant(administratorAuth, {
            userId: recipient.id,
            capability,
            departmentId: recipientDepartment.id,
          });
          assert.equal(response.status, 400, JSON.stringify(response.body));
          assert.equal(
            response.body.error.code,
            "INVALID_CAPABILITY_FOR_ROLE",
          );
        }
      },
    );

    await context.test("scope and request bodies are explicit", async () => {
      const missingDepartment = await postGrant(administratorAuth, {
        userId: concurrentTechnician.id,
        capability: "support",
      });
      assert.equal(missingDepartment.status, 400);

      const nullSupportScope = await postGrant(administratorAuth, {
        userId: concurrentTechnician.id,
        capability: "support",
        departmentId: null,
      });
      assert.equal(nullSupportScope.status, 400);
      assert.equal(
        nullSupportScope.body.error.code,
        "DEPARTMENT_SCOPE_REQUIRED",
      );

      const injectedActor = await postGrant(administratorAuth, {
        userId: concurrentTechnician.id,
        capability: "support",
        departmentId: recipientDepartment.id,
        grantedBy: administrator.id,
      });
      assert.equal(injectedActor.status, 400);
      assert.equal(injectedActor.body.error.code, "VALIDATION_ERROR");
    });

    await context.test(
      "cross-organization and inactive references are rejected",
      async () => {
        const foreignUser = await postGrant(administratorAuth, {
          userId: foreignTechnician.id,
          capability: "support",
          departmentId: recipientDepartment.id,
        });
        assert.equal(foreignUser.status, 404);
        assert.equal(foreignUser.body.error.code, "RECIPIENT_NOT_FOUND");

        const foreignScope = await postGrant(administratorAuth, {
          userId: concurrentTechnician.id,
          capability: "support",
          departmentId: foreignDepartment.id,
        });
        assert.equal(foreignScope.status, 404);
        assert.equal(foreignScope.body.error.code, "DEPARTMENT_NOT_FOUND");

        const inactiveRecipient = await postGrant(administratorAuth, {
          userId: inactiveTechnician.id,
          capability: "support",
          departmentId: recipientDepartment.id,
        });
        assert.equal(inactiveRecipient.status, 400);
        assert.equal(inactiveRecipient.body.error.code, "RECIPIENT_INACTIVE");

        const inactiveScope = await postGrant(administratorAuth, {
          userId: concurrentTechnician.id,
          capability: "support",
          departmentId: inactiveDepartment.id,
        });
        assert.equal(inactiveScope.status, 400);
        assert.equal(inactiveScope.body.error.code, "DEPARTMENT_INACTIVE");
      },
    );

    await context.test(
      "concurrent duplicate submissions produce one conflict",
      async () => {
        const payload = {
          userId: concurrentTechnician.id,
          capability: "support",
          departmentId: recipientDepartment.id,
        };
        const responses = await Promise.all([
          postGrant(administratorAuth, payload),
          postGrant(administratorAuth, payload),
        ]);
        assert.deepEqual(
          responses.map((response) => response.status).sort(),
          [201, 409],
        );
        assert.equal(
          responses.find((response) => response.status === 409).body.error.code,
          "ACTIVE_GRANT_EXISTS",
        );
        assert.equal(
          await AccessGrant.countDocuments({
            user: concurrentTechnician._id,
            capability: "support",
            department: recipientDepartment._id,
            isActive: true,
          }),
          1,
        );
      },
    );

    await context.test(
      "revocation is historical, idempotent, and immediately effective",
      async () => {
        const technicianAuth = await login(technician.email);
        const beforeRevocation = await request("/api/v1/auth/me", {
          cookie: technicianAuth.cookie,
        });
        const supportGrant = beforeRevocation.body.data.permissions.find(
          (grant) => grant.capability === "support",
        );
        assert.ok(supportGrant);

        const firstRevocation = await request(
          `/api/v1/admin/access-grants/${supportGrant.id}/revoke`,
          {
            method: "POST",
            cookie: administratorAuth.cookie,
            csrfToken: administratorAuth.csrfToken,
          },
        );
        assert.equal(firstRevocation.status, 200);
        assert.equal(
          firstRevocation.body.data.accessGrant.alreadyRevoked,
          false,
        );
        assert.equal(firstRevocation.body.data.accessGrant.isActive, false);
        const revokedAt = firstRevocation.body.data.accessGrant.revokedAt;

        const afterRevocation = await request("/api/v1/auth/me", {
          cookie: technicianAuth.cookie,
        });
        assert.equal(afterRevocation.status, 200);
        assert.equal(
          afterRevocation.body.data.permissions.some(
            (grant) => grant.capability === "support",
          ),
          false,
        );

        const repeatedRevocation = await request(
          `/api/v1/admin/access-grants/${supportGrant.id}/revoke`,
          {
            method: "POST",
            cookie: administratorAuth.cookie,
            csrfToken: administratorAuth.csrfToken,
          },
        );
        assert.equal(repeatedRevocation.status, 200);
        assert.equal(
          repeatedRevocation.body.data.accessGrant.alreadyRevoked,
          true,
        );
        assert.equal(
          repeatedRevocation.body.data.accessGrant.revokedAt,
          revokedAt,
        );

        const history = await request("/api/v1/admin/access-grants", {
          cookie: administratorAuth.cookie,
        });
        assert.equal(history.status, 200);
        assert.ok(
          history.body.data.accessGrants.some(
            (grant) => grant.id === supportGrant.id && !grant.isActive,
          ),
        );
        assert.equal(
          await AuthenticationAudit.countDocuments({
            eventType: "ACCESS_GRANT_REVOKED",
            accessGrant: supportGrant.id,
          }),
          1,
        );
      },
    );

    await context.test(
      "administrator role is not an operational capability bypass",
      async () => {
        const administratorMe = await request("/api/v1/auth/me", {
          cookie: administratorAuth.cookie,
        });
        assert.equal(administratorMe.status, 200);
        assert.deepEqual(administratorMe.body.data.permissions, []);
        const administratorPolicyContext = {
          user: { organizationId: organization.id },
          permissions: administratorMe.body.data.permissions,
        };
        assert.equal(
          hasDepartmentCapability(
            administratorPolicyContext,
            "support",
            recipientDepartment.id,
          ),
          false,
        );
        assert.deepEqual(
          buildSupportScopeFilter(administratorPolicyContext),
          {
            organization: organization.id,
            _id: { $exists: false },
          },
        );

        const supervisionOnlyContext = {
          user: { organizationId: organization.id },
          permissions: [
            {
              capability: "department_supervise",
              scope: {
                type: "DEPARTMENT",
                departmentId: recipientDepartment.id,
              },
            },
          ],
        };
        const visibility = ticketVisibilityPolicy(
          supervisionOnlyContext,
          recipientDepartment.id,
        );
        assert.equal(visibility.canViewPublicInformation, true);
        assert.equal(visibility.canViewInternalNotes, false);

        const technicianAuth = await login(technician.email);
        const technicianMe = await request("/api/v1/auth/me", {
          cookie: technicianAuth.cookie,
        });
        const technicianPolicyContext = {
          user: { organizationId: organization.id },
          permissions: technicianMe.body.data.permissions,
        };
        assert.deepEqual(
          buildCapabilityScopeFilter(
            technicianPolicyContext,
            "asset_manage",
          ),
          { organization: organization.id },
        );
      },
    );

    await context.test(
      "grant and audit writes roll back together",
      async () => {
        const originalCreate = AuthenticationAudit.create;
        AuthenticationAudit.create = async function failAccessAudit(
          documents,
          options,
        ) {
          const event = Array.isArray(documents) ? documents[0] : documents;
          if (event?.eventType === "ACCESS_GRANT_CREATED") {
            throw new Error("Injected audit failure");
          }
          return originalCreate.call(this, documents, options);
        };

        let response;
        try {
          response = await postGrant(administratorAuth, {
            userId: concurrentTechnician.id,
            capability: "asset_manage",
            departmentId: otherScopeDepartment.id,
          });
        } finally {
          AuthenticationAudit.create = originalCreate;
        }

        assert.equal(response.status, 500);
        assert.equal(
          await AccessGrant.countDocuments({
            user: concurrentTechnician._id,
            capability: "asset_manage",
            department: otherScopeDepartment._id,
          }),
          0,
        );
      },
    );

    await context.test(
      "revocation and audit writes roll back together",
      async () => {
        const created = await postGrant(administratorAuth, {
          userId: concurrentTechnician.id,
          capability: "asset_manage",
          departmentId: otherScopeDepartment.id,
        });
        assert.equal(created.status, 201);
        const grantId = created.body.data.accessGrant.id;

        const originalCreate = AuthenticationAudit.create;
        AuthenticationAudit.create = async function failRevocationAudit(
          documents,
          options,
        ) {
          const event = Array.isArray(documents) ? documents[0] : documents;
          if (event?.eventType === "ACCESS_GRANT_REVOKED") {
            throw new Error("Injected audit failure");
          }
          return originalCreate.call(this, documents, options);
        };

        let response;
        try {
          response = await request(
            `/api/v1/admin/access-grants/${grantId}/revoke`,
            {
              method: "POST",
              cookie: administratorAuth.cookie,
              csrfToken: administratorAuth.csrfToken,
            },
          );
        } finally {
          AuthenticationAudit.create = originalCreate;
        }

        assert.equal(response.status, 500);
        const unchanged = await AccessGrant.findById(grantId)
          .select("+isActive")
          .lean();
        assert.equal(unchanged.revokedAt, undefined);
        assert.equal(unchanged.isActive, true);
      },
    );
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
