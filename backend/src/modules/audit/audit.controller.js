import { exploreAudit } from "./audit.service.js";
import { validateAuditQuery } from "./audit.validation.js";

export async function listAudit(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ data: await exploreAudit(req.auth, validateAuditQuery(req.query)) });
}
