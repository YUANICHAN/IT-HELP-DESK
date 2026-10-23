import mongoose from "mongoose";
import { AppError } from "../errors/app-error.js";

function transactionUnavailable(error) {
  const visited = new Set();
  const pending = [error];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (
      current.code === 20 ||
      current.codeName === "IllegalOperation" ||
      /Transaction numbers are only allowed|replica set member or mongos|does not support retryable writes/iu.test(
        current.message || "",
      )
    ) {
      return true;
    }

    pending.push(
      current.cause,
      current.originalError,
      current.errorResponse?.originalError,
    );
  }

  return false;
}

export async function runRequiredTransaction(
  work,
  {
    unavailableMessage =
      "This operation requires MongoDB to run as a replica set.",
  } = {},
) {
  const mongoSession = await mongoose.startSession();

  try {
    let result;

    await mongoSession.withTransaction(async () => {
      result = await work(mongoSession);
    });

    return result;
  } catch (error) {
    if (transactionUnavailable(error)) {
      throw new AppError(
        503,
        "TRANSACTIONS_UNAVAILABLE",
        unavailableMessage,
      );
    }

    throw error;
  } finally {
    await mongoSession.endSession();
  }
}

export function isDuplicateKeyError(error) {
  const visited = new Set();
  const pending = [error];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (current.code === 11000) return true;
    pending.push(current.cause, current.originalError, current.errorResponse);
  }

  return false;
}
