import { buildCapabilityScopeFilter, hasDepartmentCapability } from "../access/scopeFilters.js";
import { AssetAssignment } from "./assetAssignment.model.js";
export function canManageAssets(auth, department) {
  return ["TECHNICIAN", "SUPERVISOR"].includes(auth.user.role) && hasDepartmentCapability(auth, "asset_manage", department);
}
export function assetView(auth, asset) {
  if (canManageAssets(auth, asset.department)) return "MANAGER";
  if (auth.user.role === "TECHNICIAN" && hasDepartmentCapability(auth, "support", asset.department) || auth.user.role === "SUPERVISOR" && hasDepartmentCapability(auth, "department_supervise", asset.department)) return "SCOPED";
  return "OWN";
}
export async function assetAccessFilter(auth, session = null) {
  const own = await AssetAssignment.find({
    organization: auth.user.organizationId,
    custodian: auth.user.id,
    returnedAt: null
  }).select("asset").session(session).lean();
  const capabilities = [];
  if (["TECHNICIAN", "SUPERVISOR"].includes(auth.user.role)) capabilities.push("asset_manage");
  if (auth.user.role === "TECHNICIAN") capabilities.push("support");
  if (auth.user.role === "SUPERVISOR") capabilities.push("department_supervise");
  return {
    organization: auth.user.organizationId,
    $or: [{
      _id: {
        $in: own.map(a => a.asset)
      }
    }, ...capabilities.map(c => buildCapabilityScopeFilter(auth, c))]
  };
}
