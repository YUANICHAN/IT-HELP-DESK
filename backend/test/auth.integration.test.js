import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import mongoose from "mongoose";
import app from "../src/app.js";
import { resetAllLoginRateLimits } from "../src/middleware/rateLimit.js";
import { AccessGrant } from "../src/modules/access/accessGrant.model.js";
import { AuthenticationAudit } from "../src/modules/auth/authenticationAudit.model.js";
import { Session } from "../src/modules/auth/session.model.js";
import { digestSessionToken } from "../src/modules/auth/session.service.js";
import { Department } from "../src/modules/organization/department.model.js";
import { Organization } from "../src/modules/organization/organization.model.js";
import {
  hashPassword,
  verifyPassword,
} from "../src/modules/users/password.service.js";
import { User } from "../src/modules/users/user.model.js";
import { isolatedDatabaseUri } from "./support/database.js";

const ALLOWED_ORIGIN = "http://127.0.0.1:5000";
const OLD_PASSWORD = "Correct-Horse-Battery-1!";
const NEW_PASSWORD = "Updated-Correct-Horse-2!";

function cookieValue(setCookie) {
  return setCookie?.split(";", 1)[0] || null;
}

function rawTokenFromCookie(cookie) {
  return decodeURIComponent(cookie.split("=", 2)[1]);
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

test("authentication HTTP integration", async (context) => {
  const databaseUri = isolatedDatabaseUri("auth");
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
    const responseText = await response.text();
    const responseBody = responseText ? JSON.parse(responseText) : null;

    return {
      status: response.status,
      body: responseBody,
      headers: response.headers,
      setCookie: response.headers.get("set-cookie"),
    };
  }

  async function login(email, password = OLD_PASSWORD, options = {}) {
    const response = await request("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
      ...options,
    });

    return {
      ...response,
      cookie: cookieValue(response.setCookie),
      csrfToken: response.body?.data?.csrfToken,
    };
  }

  try {
    const passwordHash = await hashPassword(OLD_PASSWORD);
    const organization = await Organization.create({
      name: "Authentication Test Organization",
      organizationType: "COMPANY",
      supportEmail: "support@auth-test.example",
    });
    const department = await Department.create({
      organization: organization._id,
      code: "IT",
      name: "Information Technology",
    });
    const administrator = await User.create({
      organization: organization._id,
      department: department._id,
      displayName: "Audit Administrator",
      email: "audit-admin@auth-test.example",
      passwordHash,
      role: "ADMINISTRATOR",
      accountStatus: "ACTIVE",
      mustChangePassword: false,
    });
    const alice = await User.create({
      organization: organization._id,
      department: department._id,
      displayName: "Alice Supervisor",
      email: "alice@auth-test.example",
      employeeNumber: "AUTH-001",
      phone: "+63 900 111 1111",
      passwordHash,
      role: "SUPERVISOR",
      accountStatus: "ACTIVE",
      mustChangePassword: false,
    });
    const bob = await User.create({
      organization: organization._id,
      department: department._id,
      displayName: "Bob Technician",
      email: "bob@auth-test.example",
      passwordHash,
      role: "TECHNICIAN",
      accountStatus: "ACTIVE",
      mustChangePassword: false,
    });
    const disabledUser = await User.create({
      organization: organization._id,
      department: department._id,
      displayName: "Disabled Employee",
      email: "disabled@auth-test.example",
      passwordHash,
      role: "EMPLOYEE",
      accountStatus: "DISABLED",
      mustChangePassword: false,
    });
    const passwordChangeUser = await User.create({
      organization: organization._id,
      department: department._id,
      displayName: "Password Change User",
      email: "password-change@auth-test.example",
      passwordHash,
      role: "EMPLOYEE",
      accountStatus: "ACTIVE",
      mustChangePassword: true,
    });

    await AccessGrant.create({
      organization: organization._id,
      user: alice._id,
      capability: "ticket_triage",
      grantedBy: administrator._id,
    });

    await context.test("health remains operational", async () => {
      const response = await request("/api/v1/health", { origin: null });
      assert.equal(response.status, 200);
      assert.equal(response.body.data.status, "ok");
      assert.equal(response.body.data.database, "connected");
    });

    await context.test("successful login and current identity", async () => {
      resetAllLoginRateLimits();
      const authenticated = await login("  ALICE@AUTH-TEST.EXAMPLE  ");
      assert.equal(authenticated.status, 200);
      assert.match(authenticated.setCookie, /HttpOnly/u);
      assert.match(authenticated.setCookie, /SameSite=Lax/u);
      assert.doesNotMatch(authenticated.setCookie, /Domain=/u);
      assert.ok(authenticated.cookie);
      assert.ok(authenticated.csrfToken);
      assert.equal(authenticated.body.data.user.role, "SUPERVISOR");
      assert.equal(authenticated.body.data.organization.id, organization.id);
      assert.equal(authenticated.body.data.department.id, department.id);
      assert.equal(
        authenticated.body.data.permissions[0].capability,
        "ticket_triage",
      );

      const rawToken = rawTokenFromCookie(authenticated.cookie);
      const serializedResponse = JSON.stringify(authenticated.body);
      assert.doesNotMatch(serializedResponse, /passwordHash|tokenDigest/u);
      assert.equal(serializedResponse.includes(rawToken), false);

      const current = await request("/api/v1/auth/me", {
        cookie: authenticated.cookie,
      });
      assert.equal(current.status, 200);
      assert.equal(current.body.data.user.email, "alice@auth-test.example");
      assert.equal(current.body.data.csrfToken, authenticated.csrfToken);
      assert.equal(current.headers.get("cache-control"), "no-store");
    });

    await context.test(
      "incorrect, unknown, and inactive credentials are indistinguishable",
      async () => {
        resetAllLoginRateLimits();
        const incorrect = await login(
          "alice@auth-test.example",
          "Incorrect-Password-1!",
        );
        const unknown = await login(
          "unknown@auth-test.example",
          "Incorrect-Password-1!",
        );
        const inactive = await login(
          disabledUser.email,
          OLD_PASSWORD,
        );

        for (const response of [incorrect, unknown, inactive]) {
          assert.equal(response.status, 401);
          assert.deepEqual(response.body.error.code, "INVALID_CREDENTIALS");
          assert.equal(
            response.body.error.message,
            "Email or password is incorrect.",
          );
        }

        const unexpected = await request("/api/v1/auth/login", {
          method: "POST",
          body: {
            email: alice.email,
            password: OLD_PASSWORD,
            role: "ADMINISTRATOR",
          },
        });
        assert.equal(unexpected.status, 400);
        assert.equal(unexpected.body.error.code, "VALIDATION_ERROR");
      },
    );

    await context.test("login attempts are throttled", async () => {
      resetAllLoginRateLimits();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await login(
          "throttle@auth-test.example",
          "Incorrect-Password-1!",
        );
        assert.equal(response.status, 401);
      }

      const throttled = await login(
        "throttle@auth-test.example",
        "Incorrect-Password-1!",
      );
      assert.equal(throttled.status, 429);
      assert.equal(throttled.body.error.code, "LOGIN_RATE_LIMITED");
      assert.ok(throttled.headers.get("retry-after"));
      resetAllLoginRateLimits();
    });

    await context.test("missing, expired, and revoked sessions fail", async () => {
      const missing = await request("/api/v1/auth/me");
      assert.equal(missing.status, 401);

      const expiring = await login(alice.email);
      const expiringToken = rawTokenFromCookie(expiring.cookie);
      await Session.updateOne(
        { tokenDigest: digestSessionToken(expiringToken) },
        { $set: { idleExpiresAt: new Date(Date.now() - 1000) } },
      );
      const expired = await request("/api/v1/auth/me", {
        cookie: expiring.cookie,
      });
      assert.equal(expired.status, 401);

      const revoking = await login(alice.email);
      const revokingToken = rawTokenFromCookie(revoking.cookie);
      await Session.updateOne(
        { tokenDigest: digestSessionToken(revokingToken) },
        {
          $set: {
            revokedAt: new Date(),
            revocationReason: "USER_REVOKED",
          },
        },
      );
      const revoked = await request("/api/v1/auth/me", {
        cookie: revoking.cookie,
      });
      assert.equal(revoked.status, 401);
    });

    await context.test(
      "account and session-version changes invalidate immediately",
      async () => {
        const disabling = await login(alice.email);
        await User.updateOne(
          { _id: alice._id },
          { $set: { accountStatus: "DISABLED" } },
        );
        const disabled = await request("/api/v1/auth/me", {
          cookie: disabling.cookie,
        });
        assert.equal(disabled.status, 401);
        await User.updateOne(
          { _id: alice._id },
          { $set: { accountStatus: "ACTIVE" } },
        );

        const versioned = await login(alice.email);
        await User.updateOne(
          { _id: alice._id },
          { $inc: { sessionVersion: 1 } },
        );
        const invalidated = await request("/api/v1/auth/me", {
          cookie: versioned.cookie,
        });
        assert.equal(invalidated.status, 401);
        await alice.updateOne({ $set: { sessionVersion: 0 } });
      },
    );

    await context.test("logout revokes and clears the cookie", async () => {
      const authenticated = await login(alice.email);
      const response = await request("/api/v1/auth/logout", {
        method: "POST",
        cookie: authenticated.cookie,
        csrfToken: authenticated.csrfToken,
      });
      assert.equal(response.status, 204);
      assert.match(response.setCookie, /Max-Age=0/u);
      assert.match(response.setCookie, /Path=\/api\/v1/u);

      const afterLogout = await request("/api/v1/auth/me", {
        cookie: authenticated.cookie,
      });
      assert.equal(afterLogout.status, 401);
    });

    await context.test(
      "sessions are isolated to their owning user",
      async () => {
        const aliceSession = await login(alice.email);
        const bobSession = await login(bob.email);
        const bobToken = rawTokenFromCookie(bobSession.cookie);
        const bobSessionDocument = await Session.findOne({
          tokenDigest: digestSessionToken(bobToken),
        });

        const listed = await request("/api/v1/auth/sessions", {
          cookie: aliceSession.cookie,
        });
        assert.equal(listed.status, 200);
        assert.equal(
          listed.body.data.sessions.some(
            (session) => session.id === bobSessionDocument.id,
          ),
          false,
        );
        assert.equal(
          listed.body.data.sessions.some((session) => session.isCurrent),
          true,
        );

        const forbiddenRevocation = await request(
          `/api/v1/auth/sessions/${bobSessionDocument.id}`,
          {
            method: "DELETE",
            cookie: aliceSession.cookie,
            csrfToken: aliceSession.csrfToken,
          },
        );
        assert.equal(forbiddenRevocation.status, 404);

        const bobStillAuthenticated = await request("/api/v1/auth/me", {
          cookie: bobSession.cookie,
        });
        assert.equal(bobStillAuthenticated.status, 200);
      },
    );

    await context.test("CSRF and disallowed origins are rejected", async () => {
      const authenticated = await login(alice.email);
      const missingCsrf = await request("/api/v1/auth/logout", {
        method: "POST",
        cookie: authenticated.cookie,
      });
      assert.equal(missingCsrf.status, 403);
      assert.equal(missingCsrf.body.error.code, "CSRF_VALIDATION_FAILED");

      const disallowedLogin = await login(alice.email, OLD_PASSWORD, {
        origin: "https://attacker.example",
      });
      assert.equal(disallowedLogin.status, 403);
      assert.equal(disallowedLogin.body.error.code, "ORIGIN_NOT_ALLOWED");
    });

    await context.test(
      "password changes are atomic and invalidate previous sessions",
      async (passwordTest) => {
        const hello = await mongoose.connection.db.admin().command({ hello: 1 });

        if (!hello.setName) {
          const standaloneLogin = await login(passwordChangeUser.email);
          const unavailable = await request("/api/v1/auth/change-password", {
            method: "POST",
            cookie: standaloneLogin.cookie,
            csrfToken: standaloneLogin.csrfToken,
            body: {
              currentPassword: OLD_PASSWORD,
              newPassword: NEW_PASSWORD,
            },
          });
          assert.equal(unavailable.status, 503);
          assert.equal(
            unavailable.body.error.code,
            "TRANSACTIONS_UNAVAILABLE",
          );
          const unchanged = await User.findById(passwordChangeUser._id).select(
            "+passwordHash",
          );
          assert.equal(unchanged.sessionVersion, 0);
          assert.equal(
            await verifyPassword(OLD_PASSWORD, unchanged.passwordHash),
            true,
          );
          passwordTest.diagnostic(
            "Success path requires TEST_MONGODB_URI to point to a replica set.",
          );
          return;
        }

        const first = await login(passwordChangeUser.email);
        const second = await login(passwordChangeUser.email);

        const incorrectCurrent = await request(
          "/api/v1/auth/change-password",
          {
            method: "POST",
            cookie: first.cookie,
            csrfToken: first.csrfToken,
            body: {
              currentPassword: "Incorrect-Current-Password-1!",
              newPassword: NEW_PASSWORD,
            },
          },
        );
        assert.equal(incorrectCurrent.status, 400);
        assert.equal(
          incorrectCurrent.body.error.code,
          "CURRENT_PASSWORD_INCORRECT",
        );

        const changed = await request("/api/v1/auth/change-password", {
          method: "POST",
          cookie: first.cookie,
          csrfToken: first.csrfToken,
          body: {
            currentPassword: OLD_PASSWORD,
            newPassword: NEW_PASSWORD,
          },
        });
        assert.equal(changed.status, 200);
        assert.equal(changed.body.data.user.mustChangePassword, false);
        const freshCookie = cookieValue(changed.setCookie);
        assert.ok(freshCookie);

        const oldCurrentSession = await request("/api/v1/auth/me", {
          cookie: first.cookie,
        });
        const previousSession = await request("/api/v1/auth/me", {
          cookie: second.cookie,
        });
        assert.equal(oldCurrentSession.status, 401);
        assert.equal(previousSession.status, 401);

        const freshSession = await request("/api/v1/auth/me", {
          cookie: freshCookie,
        });
        assert.equal(freshSession.status, 200);

        resetAllLoginRateLimits();
        const oldPasswordLogin = await login(
          passwordChangeUser.email,
          OLD_PASSWORD,
        );
        const newPasswordLogin = await login(
          passwordChangeUser.email,
          NEW_PASSWORD,
        );
        assert.equal(oldPasswordLogin.status, 401);
        assert.equal(newPasswordLogin.status, 200);
      },
    );

    assert.ok(await AuthenticationAudit.countDocuments());
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
