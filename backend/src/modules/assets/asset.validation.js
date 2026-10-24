import { requireExactObject } from "../../shared/http/request-validation.js";
import { text, choice, objectId, version, invalid } from "../../shared/validation/commands.js";
import { ASSET_CATEGORIES, ASSET_CONDITIONS, ASSET_STATUSES } from "./asset.model.js";
import { validateTimelineQuery } from "../tickets/ticket.validation.js";
const descriptive = ["serialNumber", "category", "manufacturer", "model", "departmentId", "locationId", "shared", "condition", "purchaseDate", "warrantyEndDate", "purchaseCost", "currency"];
export function validateAssetInput(action, body) {
  const fields = {
    create: ["assetTag", ...descriptive],
    patch: ["expectedVersion", ...descriptive, "reason"],
    assign: ["expectedVersion", "custodianId", "locationId"],
    return: ["expectedVersion", "condition", "notes"],
    state: ["expectedVersion", "action", "reason", "reference", "ticketId", "condition"]
  }[action];
  requireExactObject(body, fields, action === "create" ? ["assetTag", "category", "departmentId"] : ["expectedVersion"]);
  const result = {};
  if (action !== "create") result.expectedVersion = version(body.expectedVersion);
  if (action === "create") result.assetTag = text(body.assetTag, "assetTag", 1, 80).toUpperCase();
  for (const name of ["manufacturer", "model", "serialNumber"]) if (body[name] !== undefined) result[name] = body[name] === null || body[name] === "" || typeof body[name] === "string" && !body[name].trim() ? null : text(body[name], name, 1, 120);
  if (result.serialNumber) result.serialNumber = result.serialNumber.toUpperCase();
  for (const name of ["reason", "notes", "reference"]) if (body[name] !== undefined) result[name] = text(body[name], name, 1, name === "reference" ? 250 : 5000);
  if (body.category !== undefined) result.category = choice(body.category, ASSET_CATEGORIES, "category");
  if (body.condition !== undefined) result.condition = choice(body.condition, ASSET_CONDITIONS, "condition");
  for (const name of ["departmentId", "locationId", "custodianId", "ticketId"]) if (body[name] !== undefined) result[name] = objectId(body[name], name, name === "locationId");
  if (body.shared !== undefined) {
    if (typeof body.shared !== "boolean") invalid("shared must be a boolean.");
    result.shared = body.shared;
  }
  for (const name of ["purchaseDate", "warrantyEndDate"]) if (body[name] !== undefined) {
    if (body[name] === null) result[name] = null;else {
      if (typeof body[name] !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(body[name]) || !Number.isFinite(Date.parse(body[name])) || new Date(body[name]).toISOString().slice(0, 10) !== body[name]) invalid(`${name} must be a valid YYYY-MM-DD date.`);
      result[name] = new Date(body[name]);
    }
  }
  if (body.purchaseCost !== undefined) {
    if (body.purchaseCost === null) result.purchaseCost = null;else {
      if (typeof body.purchaseCost !== "string" || !/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/u.test(body.purchaseCost)) invalid("purchaseCost must be a nonnegative decimal string with at most two decimal places.");
      const [units, fraction = ""] = body.purchaseCost.split(".");
      result.purchaseCost = `${units}.${fraction.padEnd(2, "0")}`;
    }
  }
  if (body.currency !== undefined) {
    if (typeof body.currency !== "string" || !/^[A-Z]{3}$/u.test(body.currency)) invalid("currency must be a three-letter uppercase code.");
    result.currency = body.currency;
  }
  if (action === "assign" && !result.custodianId) invalid("custodianId is required.");
  if (action === "return" && !result.condition) invalid("Return condition is required.");
  if (action === "state") {
    result.action = choice(body.action, ["SEND_FOR_REPAIR", "COMPLETE_REPAIR", "MARK_LOST", "RECOVER", "RETIRE"], "action");
    if (!result.reason) invalid("Lifecycle actions require a reason.");
    if (["MARK_LOST", "RETIRE"].includes(result.action) && !result.reference) invalid("Loss and retirement require an incident/reference.");
    if (result.action === "SEND_FOR_REPAIR" && !result.ticketId) invalid("Repair requires a linked ticket.");
    if (["COMPLETE_REPAIR", "RECOVER"].includes(result.action) && !result.condition) invalid("Completion/recovery requires a condition.");
  }
  if (action === "patch" && !descriptive.some(f => body[f] !== undefined)) invalid("At least one editable asset field is required.");
  return result;
}
export function validateAssetQuery(query, selectable = false) {
  const allowed = ["page", "limit", "search", "departmentId", "category", "status", ...(selectable ? ["serviceItemId", "locationId"] : [])];
  if (Object.keys(query).some(k => !allowed.includes(k)) || Object.values(query).some(v => typeof v !== "string")) invalid("Unsupported or repeated asset query field.");
  const result = validateTimelineQuery(Object.fromEntries(Object.entries(query).filter(([k]) => ["page", "limit"].includes(k))));
  for (const key of ["departmentId", "locationId", "serviceItemId"]) if (query[key]) result[key] = objectId(query[key], key);
  if (selectable && !result.serviceItemId) invalid("serviceItemId is required for selection.");
  if (query.category) result.category = choice(query.category, ASSET_CATEGORIES, "category");
  if (query.status) result.status = choice(query.status, ASSET_STATUSES, "status");
  if (query.search) result.search = text(query.search, "search", 1, 120);
  return result;
}
