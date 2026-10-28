import { requireExactObject } from "../../shared/http/request-validation.js";
import {
  listNotifications,
  markNotificationRead,
} from "./notification.service.js";
import { validateNotificationQuery } from "./notification.validation.js";

export async function list(req, res) {
  res.status(200).json({
    data: await listNotifications(req.auth, validateNotificationQuery(req.query)),
  });
}

export async function read(req, res) {
  if (req.body !== undefined) requireExactObject(req.body, [], []);
  res.status(200).json({
    data: {
      notification: await markNotificationRead(req.auth, req.params.id),
    },
  });
}
