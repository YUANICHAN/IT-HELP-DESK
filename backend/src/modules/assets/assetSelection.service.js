import { AppError } from "../../shared/errors/app-error.js";
import { Asset } from "./asset.model.js";
import { AssetAssignment } from "./assetAssignment.model.js";
import { ServiceItem } from "../catalog/serviceItem.model.js";
import { safeAssetSnapshot } from "./asset.serializer.js";
import { Location } from "../organization/location.model.js";
export async function selectionFilter(auth, service, locationId, session = null) {
  const policy = service.configuration?.assetPolicy ?? service.assetPolicy ?? "NONE";
  if (locationId && !(await Location.exists({
    _id: locationId,
    organization: auth.user.organizationId,
    department: auth.user.departmentId,
    isActive: true
  }).session(session))) throw new AppError(422, "LOCATION_UNAVAILABLE", "Selection location must belong to your department.");
  const own = await AssetAssignment.find({
    organization: auth.user.organizationId,
    custodian: auth.user.id,
    returnedAt: null
  }).select("asset").session(session).lean();
  const clauses = [];
  if (["OWN_ONLY", "OWN_OR_SHARED_DEPARTMENT"].includes(policy)) clauses.push({
    _id: {
      $in: own.map(a => a.asset)
    }
  });
  if (policy === "OWN_OR_SHARED_DEPARTMENT") clauses.push({
    shared: true,
    department: auth.user.departmentId,
    $or: [{
      location: null
    }, ...(locationId ? [{
      location: locationId
    }] : [])]
  });
  return {
    organization: auth.user.organizationId,
    status: {
      $in: ["AVAILABLE", "ASSIGNED", "UNDER_REPAIR"]
    },
    ...(Array.isArray(service.configuration?.assetCategories) ? {
      category: {
        $in: service.configuration.assetCategories
      }
    } : {}),
    $or: clauses.length ? clauses : [{
      _id: {
        $exists: false
      }
    }]
  };
}
export async function activeSelectionService(auth, id, session = null) {
  const service = await ServiceItem.findOne({
    _id: id,
    organization: auth.user.organizationId,
    isActive: true
  }).session(session);
  if (!service) throw new AppError(422, "SERVICE_ITEM_UNAVAILABLE", "The service item is unavailable.");
  return service;
}
export async function linkTicketAssets(auth, service, assetIds, primaryAssetId, locationId, session) {
  if (!assetIds.length) return [];
  const filter = await selectionFilter(auth, service, locationId, session);
  const assets = await Asset.find({
    $and: [filter, {
      _id: {
        $in: assetIds
      }
    }]
  }).session(session);
  if (assets.length !== assetIds.length) throw new AppError(422, "ASSET_SELECTION_UNAVAILABLE", "One or more assets are not permitted by this service policy.");
  // A write on each asset serializes linking against custody/state changes. Transaction retries recheck selection.
  for (const asset of assets) await Asset.updateOne({
    _id: asset._id,
    organization: asset.organization,
    version: asset.version
  }, {
    $inc: {
      linkRevision: 1
    }
  }, {
    session,
    timestamps: false
  });
  return assetIds.map(id => safeAssetSnapshot(assets.find(a => a._id.toString() === id), id === primaryAssetId));
}
