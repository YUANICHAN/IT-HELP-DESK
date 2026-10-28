import { Router } from "express";
import {
  authenticate,
  requirePasswordChangeComplete,
} from "../../middleware/authenticate.js";
import { asyncHandler } from "../../shared/errors/app-error.js";
import { overview } from "./reporting.controller.js";

const router = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use(authenticate);
router.use(requirePasswordChangeComplete);
router.get("/overview", asyncHandler(overview));

export default router;
