import mongoose from "mongoose";
import { AppError } from "../../shared/errors/app-error.js";
import { clockNow } from "../../shared/time/clock.js";
import { authorizeNotificationRecord } from "./notificationAuthorization.service.js";
import { Notification } from "./notification.model.js";

function notFound() {
  return new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification was not found.");
}

function serializedNotification(notification, authorization) {
  return {
    id: notification._id.toString(),
    eventType: notification.eventType,
    title: notification.title,
    resource: {
      type: notification.aggregateType,
      id: notification.aggregateId.toString(),
      ...(authorization.linkAllowed && notification.linkPath
        ? { link: notification.linkPath }
        : {}),
    },
    metadata: notification.metadata || {},
    deliveredAt: notification.deliveredAt.toISOString(),
    readAt: notification.readAt?.toISOString() || null,
  };
}

async function permittedRows(authentication) {
  const rows = await Notification.find({
    organization: authentication.user.organizationId,
    recipient: authentication.user.id,
  }).sort({ createdAt: -1, _id: -1 });
  const permitted = [];
  for (const row of rows) {
    const authorization = await authorizeNotificationRecord(row);
    if (authorization.allowed) permitted.push({ row, authorization });
  }
  return permitted;
}

export async function listNotifications(authentication, filters) {
  const permitted = await permittedRows(authentication);
  const unreadTotal = permitted.filter(({ row }) => !row.readAt).length;
  const filtered = permitted.filter(({ row }) => (
    filters.state === "all" ||
    (filters.state === "read" ? Boolean(row.readAt) : !row.readAt)
  ));
  const offset = (filters.page - 1) * filters.limit;
  return {
    notifications: filtered
      .slice(offset, offset + filters.limit)
      .map(({ row, authorization }) => serializedNotification(row, authorization)),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: filtered.length,
      pages: Math.ceil(filtered.length / filters.limit),
    },
    unreadTotal,
  };
}

export async function markNotificationRead(authentication, notificationId) {
  if (!mongoose.isObjectIdOrHexString(notificationId)) throw notFound();
  const notification = await Notification.findOne({
    _id: notificationId,
    organization: authentication.user.organizationId,
    recipient: authentication.user.id,
  });
  if (!notification) throw notFound();
  const authorization = await authorizeNotificationRecord(notification);
  if (!authorization.allowed) throw notFound();
  if (!notification.readAt) {
    const readAt = clockNow();
    await Notification.updateOne(
      { _id: notification._id, readAt: null },
      { $set: { readAt } },
    );
    notification.readAt = readAt;
  }
  return serializedNotification(notification, authorization);
}
