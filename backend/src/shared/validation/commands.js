import mongoose from "mongoose";
import { AppError } from "../errors/app-error.js";
export function invalid(message) {
  throw new AppError(400, "VALIDATION_ERROR", message);
}
export function text(value, name, min = 1, max = 5000) {
  if (typeof value !== "string" || [...value.trim()].length < min || [...value.trim()].length > max) invalid(`${name} must contain ${min} to ${max} characters.`);
  return value.trim();
}
export function choice(value, values, name) {
  if (!values.includes(value)) invalid(`${name} is not supported.`);
  return value;
}
export function objectId(value, name, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !mongoose.isObjectIdOrHexString(value)) invalid(`${name} must be an object ID.`);
  return value;
}
export function version(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid("expectedVersion must be a non-negative integer.");
  return value;
}
export function date(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) invalid(`${name} must be an ISO timestamp with timezone.`);
  return new Date(value);
}
export function idOf(value) {
  return (value?._id || value)?.toString();
}
export function same(a, b) {
  return idOf(a) === idOf(b);
}
