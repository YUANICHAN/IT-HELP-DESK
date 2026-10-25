import { Router } from "express";
import {
  authenticate,
  requirePasswordChangeComplete,
} from "../../middleware/authenticate.js";
import { csrfProtection } from "../../middleware/csrfProtection.js";
import { asyncHandler } from "../../shared/errors/app-error.js";
import {
  command,
  worklogs,
  comments,
  create,
  detail,
  events,
  list,
  queue,
} from "./ticket.controller.js";
import { upload, list as attachments } from "../attachments/attachment.routes.js";
import { reroute, history as approvalHistory } from "../approvals/approvals.controller.js";

function ticketSecurity(router) {
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.use(authenticate);
  router.use(requirePasswordChangeComplete);
}

const router = Router();
ticketSecurity(router);

router.post("/", csrfProtection, asyncHandler(create));
router.get("/", asyncHandler(list));
router.get("/:ticketId", asyncHandler(detail));
router.post("/:ticketId/approval-reroutes", csrfProtection, asyncHandler(reroute));
router.get("/:ticketId/approvals", asyncHandler(approvalHistory));
router.patch("/:ticketId", csrfProtection, command("patch"));
for (const action of ["claim", "start", "triage", "assignment", "wait", "resume", "cancel", "reopen", "resolve", "close"]) router.post(`/:ticketId/${action}`, csrfProtection, command(action));
router.get("/:ticketId/comments", asyncHandler(comments));
router.post("/:ticketId/comments", csrfProtection, command("comment"));
router.get("/:ticketId/events", asyncHandler(events));
router.get("/:ticketId/worklogs", worklogs);
router.post("/:ticketId/worklogs", csrfProtection, command("worklog"));
router.get("/:ticketId/attachments", attachments);
router.post("/:ticketId/attachments", csrfProtection, upload);

const queueRouter = Router();
ticketSecurity(queueRouter);
queueRouter.get("/", asyncHandler(queue));

export { queueRouter };
export default router;
