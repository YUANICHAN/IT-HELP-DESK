import mongoose from "mongoose";
import {
  isDuplicateKeyError,
  runRequiredTransaction,
} from "../../shared/database/transaction.js";
import { AppError } from "../../shared/errors/app-error.js";
import { recordRequiredAuditEvent } from "../auth/audit.service.js";
import { Department } from "../organization/department.model.js";
import { User } from "../users/user.model.js";
import {
  ACCESS_CAPABILITIES,
  AccessGrant,
  CAPABILITY_RULES,
} from "./accessGrant.model.js";

function validateObjectId(value, code, message) {
  if (!mongoose.isObjectIdOrHexString(value)) {
    throw new AppError(400, code, message);
  }
}

async function validateAdministratorActor(actor, mongoSession) {
  const administrator = await User.exists({
    _id: actor.id,
    organization: actor.organizationId,
    role: "ADMINISTRATOR",
    accountStatus: "ACTIVE",
  }).session(mongoSession);

  if (!administrator) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Administrator access is required for this operation.",
    );
  }
}

async function validateGrantRequest(
  { organizationId, userId, capability, departmentId },
  mongoSession,
) {
  if (!ACCESS_CAPABILITIES.includes(capability)) {
    throw new AppError(
      400,
      "INVALID_CAPABILITY",
      "Capability is not supported.",
    );
  }

  validateObjectId(userId, "INVALID_USER_ID", "User ID is invalid.");
  if (departmentId !== null) {
    validateObjectId(
      departmentId,
      "INVALID_DEPARTMENT_ID",
      "Department ID is invalid.",
    );
  }

  const userQuery = User.findOne({
    _id: userId,
    organization: organizationId,
  }).select({ role: 1, accountStatus: 1, organization: 1 });
  if (mongoSession) userQuery.session(mongoSession);
  const recipient = await userQuery.lean();

  if (!recipient) {
    throw new AppError(
      404,
      "RECIPIENT_NOT_FOUND",
      "The recipient was not found in this organization.",
    );
  }

  if (recipient.accountStatus !== "ACTIVE") {
    throw new AppError(
      400,
      "RECIPIENT_INACTIVE",
      "Access grants require an active recipient account.",
    );
  }

  const rule = CAPABILITY_RULES[capability];

  if (!rule.roles.includes(recipient.role)) {
    throw new AppError(
      400,
      "INVALID_CAPABILITY_FOR_ROLE",
      "The capability cannot be granted to the recipient's role.",
    );
  }

  if (rule.departmentRequired && departmentId === null) {
    throw new AppError(
      400,
      "DEPARTMENT_SCOPE_REQUIRED",
      "This capability requires a department scope.",
    );
  }

  let department = null;

  if (departmentId !== null) {
    const departmentQuery = Department.findOne({
      _id: departmentId,
      organization: organizationId,
    }).select({ isActive: 1, organization: 1 });
    if (mongoSession) departmentQuery.session(mongoSession);
    department = await departmentQuery.lean();

    if (!department) {
      throw new AppError(
        404,
        "DEPARTMENT_NOT_FOUND",
        "The department was not found in this organization.",
      );
    }

    if (!department.isActive) {
      throw new AppError(
        400,
        "DEPARTMENT_INACTIVE",
        "Access grants require an active department scope.",
      );
    }
  }

  return { recipient, department };
}

function safeUser(user) {
  if (!user) return null;

  return {
    id: user._id.toString(),
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
  };
}

function safeActor(user) {
  if (!user) return null;

  return {
    id: user._id.toString(),
    displayName: user.displayName,
  };
}

function safeAccessGrant(grant, alreadyRevoked = false) {
  const organizationWide = grant.scopeKey === "ORGANIZATION";

  return {
    id: grant._id.toString(),
    capability: grant.capability,
    recipient: safeUser(grant.user),
    scope: organizationWide
      ? {
          type: "ORGANIZATION",
          department: null,
        }
      : {
          type: "DEPARTMENT",
          department: grant.department
            ? {
                id: grant.department._id.toString(),
                code: grant.department.code,
                name: grant.department.name,
                isActive: grant.department.isActive,
              }
            : null,
        },
    grantedBy: safeActor(grant.grantedBy),
    revokedBy: safeActor(grant.revokedBy),
    revokedAt: grant.revokedAt?.toISOString?.() ?? null,
    isActive: !grant.revokedAt,
    alreadyRevoked,
    createdAt: grant.createdAt.toISOString(),
    updatedAt: grant.updatedAt.toISOString(),
  };
}

async function populatedGrant(organizationId, grantId) {
  return AccessGrant.findOne({
    _id: grantId,
    organization: organizationId,
  })
    .select("+scopeKey")
    .populate({
      path: "user",
      select: "displayName email role accountStatus",
    })
    .populate({ path: "department", select: "code name isActive" })
    .populate({ path: "grantedBy", select: "displayName" })
    .populate({ path: "revokedBy", select: "displayName" })
    .lean();
}

export async function listAccessGrants(organizationId) {
  const grants = await AccessGrant.find({ organization: organizationId })
    .select("+scopeKey")
    .populate({
      path: "user",
      select: "displayName email role accountStatus",
    })
    .populate({ path: "department", select: "code name isActive" })
    .populate({ path: "grantedBy", select: "displayName" })
    .populate({ path: "revokedBy", select: "displayName" })
    .sort({ createdAt: -1 })
    .lean();

  return grants.map((grant) => safeAccessGrant(grant));
}

export async function createAccessGrant({
  actor,
  userId,
  capability,
  departmentId,
  metadata,
}) {
  let grantId;

  try {
    await runRequiredTransaction(async (mongoSession) => {
      await validateAdministratorActor(actor, mongoSession);
      await validateGrantRequest(
        {
          organizationId: actor.organizationId,
          userId,
          capability,
          departmentId,
        },
        mongoSession,
      );

      const [grant] = await AccessGrant.create(
        [
          {
            organization: actor.organizationId,
            user: userId,
            capability,
            department: departmentId,
            grantedBy: actor.id,
          },
        ],
        { session: mongoSession },
      );
      grantId = grant._id;

      await recordRequiredAuditEvent(
        {
          eventType: "ACCESS_GRANT_CREATED",
          outcome: "SUCCESS",
          organization: actor.organizationId,
          user: actor.id,
          session: actor.sessionId,
          targetUser: userId,
          accessGrant: grant._id,
          capability,
          department: departmentId,
          ...metadata,
        },
        mongoSession,
      );
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        409,
        "ACTIVE_GRANT_EXISTS",
        "An active grant already exists for this recipient, capability, and scope.",
      );
    }

    throw error;
  }

  const grant = await populatedGrant(actor.organizationId, grantId);
  return safeAccessGrant(grant);
}

export async function revokeAccessGrant({ actor, grantId, metadata }) {
  validateObjectId(
    grantId,
    "INVALID_ACCESS_GRANT_ID",
    "Access grant ID is invalid.",
  );

  const result = await runRequiredTransaction(async (mongoSession) => {
    await validateAdministratorActor(actor, mongoSession);
    const grant = await AccessGrant.findOne({
      _id: grantId,
      organization: actor.organizationId,
    }).session(mongoSession);

    if (!grant) {
      throw new AppError(
        404,
        "ACCESS_GRANT_NOT_FOUND",
        "Access grant was not found.",
      );
    }

    if (grant.revokedAt) {
      return { grantId: grant._id, alreadyRevoked: true };
    }

    const revokedAt = new Date();
    const updateResult = await AccessGrant.updateOne(
      {
        _id: grant._id,
        revokedAt: { $exists: false },
      },
      {
        $set: {
          isActive: false,
          revokedBy: actor.id,
          revokedAt,
        },
      },
      { session: mongoSession },
    );

    if (updateResult.modifiedCount !== 1) {
      const currentGrant = await AccessGrant.findById(grant._id).session(
        mongoSession,
      );
      return {
        grantId: grant._id,
        alreadyRevoked: Boolean(currentGrant?.revokedAt),
      };
    }

    await recordRequiredAuditEvent(
      {
        eventType: "ACCESS_GRANT_REVOKED",
        outcome: "SUCCESS",
        organization: actor.organizationId,
        user: actor.id,
        session: actor.sessionId,
        targetUser: grant.user,
        accessGrant: grant._id,
        capability: grant.capability,
        department: grant.department,
        ...metadata,
      },
      mongoSession,
    );

    return { grantId: grant._id, alreadyRevoked: false };
  });

  const grant = await populatedGrant(actor.organizationId, result.grantId);
  return safeAccessGrant(grant, result.alreadyRevoked);
}
