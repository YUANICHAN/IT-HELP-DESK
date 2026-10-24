import { Router } from "express";
import {
  authenticate,
  requirePasswordChangeComplete,
} from "../../middleware/authenticate.js";
import { csrfProtection } from "../../middleware/csrfProtection.js";
import { asyncHandler } from "../../shared/errors/app-error.js";
import {
  claim,
  close,
  comment,
  comments,
  create,
  detail,
  events,
  list,
  queue,
  resolve,
  start,
} from "./ticket.controller.js";

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
router.post("/:ticketId/claim", csrfProtection, asyncHandler(claim));
router.post("/:ticketId/start", csrfProtection, asyncHandler(start));
router.get("/:ticketId/comments", asyncHandler(comments));
router.post("/:ticketId/comments", csrfProtection, asyncHandler(comment));
router.get("/:ticketId/events", asyncHandler(events));
router.post("/:ticketId/resolve", csrfProtection, asyncHandler(resolve));
router.post("/:ticketId/close", csrfProtection, asyncHandler(close));

const queueRouter = Router();
ticketSecurity(queueRouter);
queueRouter.get("/", asyncHandler(queue));

export { queueRouter };
export default router;
