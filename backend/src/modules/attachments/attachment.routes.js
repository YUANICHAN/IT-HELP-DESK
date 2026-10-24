import { Router } from "express";
import { authenticate, requirePasswordChangeComplete } from "../../middleware/authenticate.js";
import { requireIdempotencyKey } from "../../shared/database/idempotency.js";
import { requestClientMetadata } from "../auth/session.service.js";
import { validateTimelineQuery } from "../tickets/ticket.validation.js";
import { parseAttachment } from "./attachment.validation.js";
import { uploadAttachment, listAttachments, downloadAttachment, attachmentMetadata } from "./attachment.service.js";
export async function upload(req, res) {
  const idempotencyKey = requireIdempotencyKey(req);
  const {
    input,
    buffer
  } = await parseAttachment(req);
  const result = await uploadAttachment({
    authentication: req.auth,
    ticketId: req.params.ticketId,
    input,
    buffer,
    idempotencyKey,
    metadata: requestClientMetadata(req)
  });
  if (result.replayed) res.set("Idempotency-Replayed", "true");
  res.status(result.status).json({
    data: result.data
  });
}
export async function list(req, res) {
  res.json({
    data: await listAttachments(req.auth, req.params.ticketId, validateTimelineQuery(req.query))
  });
}
const router = Router();
router.use(authenticate, requirePasswordChangeComplete, (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.get("/:attachmentId", async (req, res) => res.json({
  data: {
    attachment: await attachmentMetadata(req.auth, req.params.attachmentId)
  }
}));
router.get("/:attachmentId/download", async (req, res) => {
  const {
    metadata,
    buffer
  } = await downloadAttachment(req.auth, req.params.attachmentId);
  const ascii = metadata.filename.replace(/[^a-zA-Z0-9._ -]/gu, "_");
  const encoded = encodeURIComponent(metadata.filename).replace(/[!'()*]/gu, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  res.set({
    "Content-Type": metadata.mimeType,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`,
    "X-Content-Type-Options": "nosniff"
  });
  res.send(buffer);
});
export default router;
