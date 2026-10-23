import { AppError } from "../errors/app-error.js";

export function requireExactObject(body, allowedFields, requiredFields) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "The request body must be a JSON object.",
    );
  }

  const suppliedFields = Object.keys(body);
  const unexpectedFields = suppliedFields.filter(
    (field) => !allowedFields.includes(field),
  );

  if (unexpectedFields.length > 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "The request body contains unsupported fields.",
    );
  }

  const missingFields = requiredFields.filter(
    (field) => !Object.hasOwn(body, field),
  );

  if (missingFields.length > 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "The request body is missing required fields.",
    );
  }
}

export function requireString(value, fieldName, maximumCharacters) {
  if (typeof value !== "string" || !value) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${fieldName} must be a non-empty string.`,
    );
  }

  if ([...value].length > maximumCharacters) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `${fieldName} is too long.`,
    );
  }

  return value;
}
