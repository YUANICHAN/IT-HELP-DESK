import { requestClientMetadata } from "../auth/session.service.js";
import { requireExactObject, requireString } from "../../shared/http/request-validation.js";
import { AppError } from "../../shared/errors/app-error.js";
import {
  createAccessGrant,
  listAccessGrants,
  revokeAccessGrant,
} from "./access.service.js";

function actingContext(req) {
  return {
    id: req.auth.user.id,
    organizationId: req.auth.user.organizationId,
    sessionId: req.auth.session.id,
  };
}

export async function list(req, res) {
  if (Object.keys(req.query).length > 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Query parameters are not supported by this endpoint.",
    );
  }

  const grants = await listAccessGrants(req.auth.user.organizationId);
  res.status(200).json({ data: { accessGrants: grants } });
}

export async function create(req, res) {
  requireExactObject(
    req.body,
    ["userId", "capability", "departmentId"],
    ["userId", "capability", "departmentId"],
  );

  const userId = requireString(req.body.userId, "User ID", 64);
  const capability = requireString(req.body.capability, "Capability", 80);
  const { departmentId } = req.body;

  if (departmentId !== null && typeof departmentId !== "string") {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Department ID must be a string or explicit null.",
    );
  }

  const grant = await createAccessGrant({
    actor: actingContext(req),
    userId,
    capability,
    departmentId,
    metadata: requestClientMetadata(req),
  });

  res.status(201).json({ data: { accessGrant: grant } });
}

export async function revoke(req, res) {
  if (req.body !== undefined) {
    requireExactObject(req.body, [], []);
  }

  const grant = await revokeAccessGrant({
    actor: actingContext(req),
    grantId: req.params.grantId,
    metadata: requestClientMetadata(req),
  });

  res.status(200).json({ data: { accessGrant: grant } });
}
