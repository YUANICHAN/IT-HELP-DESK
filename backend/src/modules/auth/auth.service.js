import { randomBytes } from "node:crypto";
import { AccessGrant } from "../access/accessGrant.model.js";
import { Department } from "../organization/department.model.js";
import { Organization } from "../organization/organization.model.js";
import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "../users/password.service.js";
import { User } from "../users/user.model.js";
import { AppError } from "../../shared/errors/app-error.js";
import { runRequiredTransaction } from "../../shared/database/transaction.js";
import { recordAuthenticationEvent } from "./audit.service.js";
import { Session } from "./session.model.js";
import {
  createSession,
  listActiveSessions,
  revokeOwnedSession,
  safeSession,
} from "./session.service.js";

const MAXIMUM_TENANT_EMAIL_MATCHES = 10;
let dummyPasswordHashPromise;

function invalidCredentialsError() {
  return new AppError(
    401,
    "INVALID_CREDENTIALS",
    "Email or password is incorrect.",
  );
}

function dummyPasswordHash() {
  if (!dummyPasswordHashPromise) {
    dummyPasswordHashPromise = hashPassword(
      `${randomBytes(24).toString("base64url")}Aa1!`,
    );
  }

  return dummyPasswordHashPromise;
}

function safeGrant(grant) {
  return {
    id: grant._id.toString(),
    capability: grant.capability,
    scope: grant.department
      ? {
          type: "DEPARTMENT",
          departmentId: grant.department.toString(),
        }
      : { type: "ORGANIZATION" },
  };
}

async function loadIdentity(user) {
  const [organization, department, grants] = await Promise.all([
    Organization.findById(user.organization).lean(),
    Department.findById(user.department).lean(),
    AccessGrant.find({
      organization: user.organization,
      user: user._id,
      isActive: true,
      revokedAt: { $exists: false },
    }).lean(),
  ]);

  if (!organization?.isActive || !department) return null;

  return {
    user: {
      id: user._id.toString(),
      organizationId: user.organization.toString(),
      departmentId: user.department.toString(),
      displayName: user.displayName,
      email: user.email,
      employeeNumber: user.employeeNumber,
      phone: user.phone,
      role: user.role,
      accountStatus: user.accountStatus,
      mustChangePassword: user.mustChangePassword,
      sessionVersion: user.sessionVersion,
    },
    organization: {
      id: organization._id.toString(),
      name: organization.name,
      organizationType: organization.organizationType,
      timezone: organization.timezone,
      supportEmail: organization.supportEmail,
    },
    department: {
      id: department._id.toString(),
      code: department.code,
      name: department.name,
      isActive: department.isActive,
    },
    permissions: grants.map(safeGrant),
  };
}

export function authenticationResponse(authentication) {
  return {
    user: {
      id: authentication.user.id,
      displayName: authentication.user.displayName,
      email: authentication.user.email,
      employeeNumber: authentication.user.employeeNumber,
      phone: authentication.user.phone,
      role: authentication.user.role,
      accountStatus: authentication.user.accountStatus,
      mustChangePassword: authentication.user.mustChangePassword,
    },
    organization: authentication.organization,
    department: authentication.department,
    permissions: authentication.permissions,
    session: authentication.session,
    csrfToken: authentication.csrfToken,
  };
}

export async function login({ email, password, metadata }) {
  const normalizedEmail = email.trim().toLowerCase();
  const candidates = await User.find({ email: normalizedEmail })
    .select("+passwordHash")
    .limit(MAXIMUM_TENANT_EMAIL_MATCHES + 1);
  const dummyHash = await dummyPasswordHash();

  if (candidates.length > MAXIMUM_TENANT_EMAIL_MATCHES) {
    await verifyPassword(password, dummyHash);
    await recordAuthenticationEvent({
      eventType: "LOGIN",
      outcome: "FAILURE",
      reasonCode: "AMBIGUOUS_EMAIL",
      ...metadata,
    });
    throw invalidCredentialsError();
  }

  const comparisonCandidates = candidates.length
    ? candidates
    : [{ passwordHash: dummyHash }];
  const comparisons = await Promise.all(
    comparisonCandidates.map((candidate) =>
      verifyPassword(password, candidate.passwordHash || dummyHash),
    ),
  );
  const matchingActiveUsers = candidates.filter(
    (candidate, index) =>
      comparisons[index] && candidate.accountStatus === "ACTIVE",
  );

  if (matchingActiveUsers.length !== 1) {
    await recordAuthenticationEvent({
      eventType: "LOGIN",
      outcome: "FAILURE",
      reasonCode: "INVALID_CREDENTIALS",
      ...metadata,
    });
    throw invalidCredentialsError();
  }

  const user = matchingActiveUsers[0];
  const identity = await loadIdentity(user);

  if (!identity) {
    await recordAuthenticationEvent({
      eventType: "LOGIN",
      outcome: "FAILURE",
      reasonCode: "INVALID_CREDENTIALS",
      ...metadata,
    });
    throw invalidCredentialsError();
  }

  const createdSession = await createSession({ user, metadata });

  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date() } },
  );

  await recordAuthenticationEvent({
    eventType: "LOGIN",
    outcome: "SUCCESS",
    organization: user.organization,
    user: user._id,
    session: createdSession.document._id,
    ...metadata,
  });

  return {
    authentication: {
      ...identity,
      session: safeSession(
        createdSession.document,
        createdSession.document._id,
      ),
      csrfToken: createdSession.csrfToken,
    },
    rawToken: createdSession.rawToken,
    absoluteExpiresAt: createdSession.document.absoluteExpiresAt,
  };
}

export async function logout(authentication, metadata) {
  const revokedSession = await revokeOwnedSession({
    userId: authentication.user.id,
    sessionId: authentication.session.id,
    reason: "LOGOUT",
  });

  await recordAuthenticationEvent({
    eventType: "LOGOUT",
    outcome: "SUCCESS",
    organization: authentication.organization.id,
    user: authentication.user.id,
    session: revokedSession?._id,
    ...metadata,
  });
}

export async function sessions(authentication) {
  return listActiveSessions(
    authentication.user,
    authentication.session.id,
  );
}

export async function revokeSession(
  authentication,
  sessionId,
  metadata,
) {
  const revokedSession = await revokeOwnedSession({
    userId: authentication.user.id,
    sessionId,
    reason: "USER_REVOKED",
  });

  if (!revokedSession) {
    throw new AppError(404, "SESSION_NOT_FOUND", "Session was not found.");
  }

  await recordAuthenticationEvent({
    eventType: "SESSION_REVOKED",
    outcome: "SUCCESS",
    organization: authentication.organization.id,
    user: authentication.user.id,
    session: revokedSession._id,
    ...metadata,
  });

  return revokedSession;
}

export async function changePassword({
  authentication,
  currentPassword,
  newPassword,
  metadata,
}) {
  try {
    validateNewPassword(newPassword);
  } catch (error) {
    throw new AppError(400, "PASSWORD_POLICY_VIOLATION", error.message);
  }

  const currentUser = await User.findOne({
    _id: authentication.user.id,
    accountStatus: "ACTIVE",
  }).select("+passwordHash");

  if (
    !currentUser ||
    !(await verifyPassword(currentPassword, currentUser.passwordHash))
  ) {
    throw new AppError(
      400,
      "CURRENT_PASSWORD_INCORRECT",
      "Current password is incorrect.",
    );
  }

  if (await verifyPassword(newPassword, currentUser.passwordHash)) {
    throw new AppError(
      400,
      "PASSWORD_REUSE_NOT_ALLOWED",
      "The new password must differ from the current password.",
    );
  }

  const passwordHash = await hashPassword(newPassword);
  let createdSession;
  let updatedUser;

  await runRequiredTransaction(
    async (mongoSession) => {
      updatedUser = await User.findOneAndUpdate(
        {
          _id: currentUser._id,
          accountStatus: "ACTIVE",
          sessionVersion: authentication.user.sessionVersion,
        },
        {
          $set: {
            passwordHash,
            mustChangePassword: false,
          },
          $inc: { sessionVersion: 1 },
        },
        {
          returnDocument: "after",
          runValidators: true,
          session: mongoSession,
        },
      ).select("+passwordHash");

      if (!updatedUser) {
        throw new AppError(
          409,
          "ACCOUNT_CHANGED",
          "The account changed during the password update. Sign in again.",
        );
      }

      await Session.updateMany(
        {
          user: updatedUser._id,
          revokedAt: { $exists: false },
        },
        {
          $set: {
            revokedAt: new Date(),
            revocationReason: "PASSWORD_CHANGED",
          },
        },
        { session: mongoSession },
      );

      createdSession = await createSession({
        user: updatedUser,
        metadata,
        mongoSession,
      });
    },
    {
      unavailableMessage:
        "Password changes require MongoDB to run as a replica set.",
    },
  );

  const identity = await loadIdentity(updatedUser);

  await recordAuthenticationEvent({
    eventType: "PASSWORD_CHANGED",
    outcome: "SUCCESS",
    organization: updatedUser.organization,
    user: updatedUser._id,
    session: createdSession.document._id,
    ...metadata,
  });

  return {
    authentication: {
      ...identity,
      session: safeSession(
        createdSession.document,
        createdSession.document._id,
      ),
      csrfToken: createdSession.csrfToken,
    },
    rawToken: createdSession.rawToken,
    absoluteExpiresAt: createdSession.document.absoluteExpiresAt,
  };
}
