import { assetCommand, getAsset, listAssets, assetHistory } from "./asset.service.js";
import { validateAssetInput, validateAssetQuery } from "./asset.validation.js";
import { validateTimelineQuery } from "../tickets/ticket.validation.js";
import { requireIdempotencyKey } from "../../shared/database/idempotency.js";
import { requestClientMetadata } from "../auth/session.service.js";
export const command = action => async (req, res) => {
  const result = await assetCommand({
    authentication: req.auth,
    assetId: req.params.assetId,
    action,
    input: validateAssetInput(action, req.body),
    idempotencyKey: requireIdempotencyKey(req),
    metadata: requestClientMetadata(req)
  });
  if (result.replayed) res.set("Idempotency-Replayed", "true");
  res.status(result.status).json({
    data: result.data
  });
};
export const list = selectable => async (req, res) => res.json({
  data: await listAssets(req.auth, validateAssetQuery(req.query, selectable), selectable)
});
export const detail = async (req, res) => res.json({
  data: {
    asset: await getAsset(req.auth, req.params.assetId)
  }
});
export const history = kind => async (req, res) => res.json({
  data: await assetHistory(req.auth, req.params.assetId, kind, validateTimelineQuery(req.query))
});
