import { idOf } from "../../shared/validation/commands.js";
import { assetView } from "./asset.policy.js";
export function serializeAsset(auth, asset) {
  const view = assetView(auth, asset);
  return {
    id: idOf(asset),
    assetTag: asset.assetTag,
    serialNumber: asset.serialNumber,
    category: asset.category,
    manufacturer: asset.manufacturer,
    model: asset.model,
    departmentId: idOf(asset.department),
    locationId: idOf(asset.location) || null,
    shared: asset.shared,
    status: asset.status,
    condition: asset.condition,
    version: asset.version,
    viewer: view,
    ...(view === "MANAGER" ? {
      purchaseDate: asset.purchaseDate,
      warrantyEndDate: asset.warrantyEndDate,
      purchaseCost: asset.purchaseCost?.toString() ?? null,
      currency: asset.currency,
      creatorId: idOf(asset.creator),
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt
    } : {})
  };
}
export function safeAssetSnapshot(asset, primary = false) {
  return {
    assetId: idOf(asset),
    assetTag: asset.assetTag,
    category: asset.category,
    model: asset.model,
    departmentId: idOf(asset.department),
    locationId: idOf(asset.location) || null,
    primary
  };
}
export function serializeCustody(row) {
  return {
    id: idOf(row),
    custodianId: idOf(row.custodian),
    department: row.departmentSnapshot,
    location: row.locationSnapshot,
    assignedBy: idOf(row.assignedBy),
    assignedAt: row.assignedAt,
    returnedBy: idOf(row.returnedBy) || null,
    returnedAt: row.returnedAt,
    returnCondition: row.returnCondition,
    returnNotes: row.returnNotes
  };
}
