import mongoose from "mongoose";
import { ServiceItem } from "../catalog/serviceItem.model.js";
import { AppError } from "../../shared/errors/app-error.js";
import { BusinessCalendar } from "./businessCalendar.model.js";
import { SlaPolicy } from "./slaPolicy.model.js";

function validObjectId(value) {
  return mongoose.isObjectIdOrHexString(value);
}

function snapshot(document) {
  const plain = document.toObject({ depopulate: true, versionKey: false });
  return structuredClone(plain);
}

export async function loadTicketConfiguration({
  organizationId,
  serviceItemId,
  mongoSession,
}) {
  if (!validObjectId(serviceItemId)) {
    throw new AppError(400, "VALIDATION_ERROR", "Service item ID is invalid.");
  }

  let serviceQuery = ServiceItem.findOne({
    _id: serviceItemId,
    organization: organizationId,
    isActive: true,
  });
  if (mongoSession) serviceQuery = serviceQuery.session(mongoSession);
  const serviceItem = await serviceQuery;

  if (!serviceItem) {
    throw new AppError(
      422,
      "SERVICE_ITEM_UNAVAILABLE",
      "The selected service item is not active or does not exist.",
    );
  }

  let policyQuery = SlaPolicy.findOne({
    _id: serviceItem.slaPolicy,
    organization: organizationId,
    isActive: true,
  });
  if (mongoSession) policyQuery = policyQuery.session(mongoSession);
  const slaPolicy = await policyQuery;

  if (!slaPolicy) {
    throw new AppError(
      422,
      "SLA_CONFIGURATION_UNAVAILABLE",
      "The service item does not have an active SLA policy.",
    );
  }

  let calendarQuery = BusinessCalendar.findOne({
    _id: slaPolicy.businessCalendar,
    organization: organizationId,
    isActive: true,
  });
  if (mongoSession) calendarQuery = calendarQuery.session(mongoSession);
  const businessCalendar = await calendarQuery;

  if (!businessCalendar) {
    throw new AppError(
      422,
      "SLA_CONFIGURATION_UNAVAILABLE",
      "The SLA policy does not have an active business calendar.",
    );
  }

  return {
    serviceItem,
    slaPolicy,
    businessCalendar,
    snapshots: {
      service: snapshot(serviceItem),
      slaPolicy: snapshot(slaPolicy),
      businessCalendar: snapshot(businessCalendar),
    },
  };
}
