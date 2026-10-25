import { AssetAssignment } from "../assets/assetAssignment.model.js";
import { enqueueOutboxEvent } from "../outbox/outbox.service.js";

export async function enqueueAssetNotifications({
  asset,
  event,
  type,
  data = {},
  occurredAt,
}, session) {
  const directRecipients = [];
  if (["ASSIGNED", "RETURNED"].includes(type) && data.assignmentId) {
    const assignment = await AssetAssignment.findOne({
      _id: data.assignmentId,
      organization: asset.organization,
      asset: asset._id,
    }).session(session).lean();
    if (assignment) {
      directRecipients.push({
        userId: assignment.custodian,
        accessKind: "ASSET_CUSTODIAN",
        visibility: "PUBLIC",
        channel: "IN_APP",
      });
    }
  }
  return enqueueOutboxEvent({
    organization: asset.organization,
    sourceEvent: event._id,
    eventType: `ASSET_${type}`,
    aggregateType: "ASSET",
    aggregateId: asset._id,
    directRecipients,
    capabilityRecipients: [{
      capability: "asset_manage",
      department: asset.department,
      accessKind: "ASSET_MANAGER",
      visibility: "ASSET_MANAGERS",
      channel: "IN_APP",
    }],
    metadata: {
      assetTag: asset.assetTag,
      assignmentId: data.assignmentId,
      custodianId: directRecipients[0]?.userId,
    },
    occurredAt,
  }, session);
}
