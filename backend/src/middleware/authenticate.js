import { sessionConfig } from "../config/session.js";
import { AccessGrant, CAPABILITY_RULES } from "../modules/access/accessGrant.model.js";
import { recordAuthenticationEvent } from "../modules/auth/audit.service.js";
import { Session } from "../modules/auth/session.model.js";
import {
  clearSessionCookie,
  csrfTokenForSession,
  digestSessionToken,
  requestClientMetadata,
  safeSession,
  sessionTokenFromRequest,
} from "../modules/auth/session.service.js";
import { Department } from "../modules/organization/department.model.js";
import { Organization } from "../modules/organization/organization.model.js";
import { User } from "../modules/users/user.model.js";
import { AppError, asyncHandler } from "../shared/errors/app-error.js";

function authenticationRequired() {
  return new AppError(
    401,
    "AUTHENTICATION_REQUIRED",
    "Valid authentication is required.",
  );
}

async function rejectSession(req, res, session, reasonCode) {
  if (session && !session.revokedAt) {
    await Session.updateOne(
      { _id: session._id, revokedAt: { $exists: false } },
      {
        $set: {
          revokedAt: new Date(),
          revocationReason: reasonCode,
        },
      },
    ).catch(() => undefined);
  }

  clearSessionCookie(res);
  const metadata = requestClientMetadata(req);
  await recordAuthenticationEvent({
    eventType: "AUTHENTICATION_REJECTED",
    outcome: "FAILURE",
    reasonCode,
    organization: session?.organization,
    user: session?.user,
    session: session?._id,
    ...metadata,
  });

  throw authenticationRequired();
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

export const authenticate = asyncHandler(async (req, res, next) => {
  const rawToken = sessionTokenFromRequest(req);

  if (!rawToken) throw authenticationRequired();

  const session = await Session.findOne({
    tokenDigest: digestSessionToken(rawToken),
  });

  if (!session) {
    clearSessionCookie(res);
    throw authenticationRequired();
  }

  const now = new Date();

  if (session.revokedAt) {
    return rejectSession(req, res, session, "SESSION_REVOKED");
  }

  if (session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
    return rejectSession(req, res, session, "EXPIRED");
  }

  const user = await User.findById(session.user).lean();

  if (!user || user.accountStatus !== "ACTIVE") {
    return rejectSession(req, res, session, "ACCOUNT_DISABLED");
  }

  if (user.sessionVersion !== session.sessionVersion) {
    return rejectSession(req, res, session, "SESSION_VERSION_CHANGED");
  }

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

  if (!organization?.isActive || !department) {
    return rejectSession(req, res, session, "ACCOUNT_DISABLED");
  }

  const nextIdleExpiry = new Date(
    Math.min(
      now.getTime() + sessionConfig.idleMilliseconds,
      session.absoluteExpiresAt.getTime(),
    ),
  );
  const touchResult = await Session.updateOne(
    {
      _id: session._id,
      revokedAt: { $exists: false },
      idleExpiresAt: { $gt: now },
      absoluteExpiresAt: { $gt: now },
    },
    {
      $set: {
        lastSeenAt: now,
        idleExpiresAt: nextIdleExpiry,
      },
    },
  );

  if (touchResult.matchedCount !== 1) {
    return rejectSession(req, res, session, "EXPIRED");
  }

  session.lastSeenAt = now;
  session.idleExpiresAt = nextIdleExpiry;

  req.auth = Object.freeze({
    user: Object.freeze({
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
    }),
    organization: Object.freeze({
      id: organization._id.toString(),
      name: organization.name,
      organizationType: organization.organizationType,
      timezone: organization.timezone,
      supportEmail: organization.supportEmail,
    }),
    department: Object.freeze({
      id: department._id.toString(),
      code: department.code,
      name: department.name,
      isActive: department.isActive,
    }),
    permissions: Object.freeze(grants.filter(grant => CAPABILITY_RULES[grant.capability]?.roles.includes(user.role)).map(safeGrant)),
    session: Object.freeze(safeSession(session, session._id)),
    csrfToken: csrfTokenForSession(rawToken),
  });

  return next();
});

export function requirePasswordChangeComplete(req, _res, next) {
  if (req.auth?.user.mustChangePassword) {
    return next(
      new AppError(
        403,
        "PASSWORD_CHANGE_REQUIRED",
        "The account password must be changed before using this endpoint.",
      ),
    );
  }

  return next();
}
