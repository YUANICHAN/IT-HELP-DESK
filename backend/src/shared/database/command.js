import { runRequiredTransaction, isDuplicateKeyError } from "./transaction.js";
import { assertIdempotencyInput, findIdempotencyRecord, requestDigest, saveIdempotencyRecord } from "./idempotency.js";
import { AppError } from "../errors/app-error.js";

// Replay reauthorizes and serializes current state; stored responses never cache private data.
export async function executeCommand({
  authentication,
  operation,
  key,
  input,
  resourceType,
  status = 200,
  work,
  read
}) {
  const scope = {
    organization: authentication.user.organizationId,
    user: authentication.user.id,
    operation,
    key
  };
  const digest = requestDigest(input);
  async function replay() {
    const prior = await findIdempotencyRecord(scope);
    assertIdempotencyInput(prior, digest);
    return prior ? {
      data: await read(prior.resourceId),
      status: prior.responseStatus,
      replayed: true
    } : null;
  }
  const prior = await replay();
  if (prior) return prior;
  let resourceId;
  try {
    resourceId = await runRequiredTransaction(async session => {
      const id = await work(session);
      await saveIdempotencyRecord({
        ...scope,
        digest,
        resourceId: id,
        resourceType,
        responseStatus: status
      }, session);
      return id;
    });
  } catch (error) {
    if (isDuplicateKeyError(error) || error.status === 409) {
      const recovered = await replay();
      if (recovered) return recovered;
      if (isDuplicateKeyError(error)) throw new AppError(409, "CONFLICT", "A unique record or competing operation conflicts with this command.");
    }
    throw error;
  }
  return {
    data: await read(resourceId),
    status,
    replayed: false
  };
}
