import { User } from "../users/user.model.js";
import { Session } from "../auth/session.model.js";
import { Organization } from "../organization/organization.model.js";
import { AccessGrant, CAPABILITY_RULES } from "./accessGrant.model.js";
import { AppError } from "../../shared/errors/app-error.js";

// Called again inside business transactions, and after asynchronous filesystem work.
export async function currentAccess(authentication, session = null) {
  const user = await User.findOne({
    _id: authentication.user.id,
    organization: authentication.user.organizationId,
    accountStatus: "ACTIVE",
    mustChangePassword: false
  }).session(session).lean();
  const now = new Date();
  const liveSession = user && (await Session.exists({
    _id: authentication.session.id,
    user: user._id,
    organization: user.organization,
    sessionVersion: user.sessionVersion,
    revokedAt: {
      $exists: false
    },
    idleExpiresAt: {
      $gt: now
    },
    absoluteExpiresAt: {
      $gt: now
    }
  }).session(session));
  const organization = user && (await Organization.exists({
    _id: user.organization,
    isActive: true
  }).session(session));
  if (!user || !liveSession || !organization) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Valid authentication is required.");
  const grants = await AccessGrant.find({
    organization: user.organization,
    user: user._id,
    isActive: true,
    revokedAt: {
      $exists: false
    }
  }).session(session).lean();
  return {
    ...authentication,
    user: {
      ...authentication.user,
      role: user.role,
      departmentId: user.department.toString(),
      sessionVersion: user.sessionVersion
    },
    permissions: grants.filter(g => CAPABILITY_RULES[g.capability]?.roles.includes(user.role)).map(g => ({
      id: g._id.toString(),
      capability: g.capability,
      scope: g.department ? {
        type: "DEPARTMENT",
        departmentId: g.department.toString()
      } : {
        type: "ORGANIZATION"
      }
    }))
  };
}
