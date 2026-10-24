import { Router } from "express";
import { authenticate, requirePasswordChangeComplete } from "../../middleware/authenticate.js";
import { csrfProtection } from "../../middleware/csrfProtection.js";
import { command, list, detail, history } from "./asset.controller.js";
const router = Router();
router.use(authenticate, requirePasswordChangeComplete, (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.get("/", list(false));
router.post("/", csrfProtection, command("create"));
router.get("/selectable", list(true));
router.get("/:assetId", detail);
router.patch("/:assetId", csrfProtection, command("patch"));
for (const action of ["assign", "return", "state"]) router.post(`/:assetId/${action}`, csrfProtection, command(action));
for (const kind of ["custody", "events", "tickets"]) router.get(`/:assetId/${kind}`, history(kind));
export default router;
