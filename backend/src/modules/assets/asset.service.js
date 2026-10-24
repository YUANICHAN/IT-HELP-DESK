import mongoose from "mongoose";
import { Asset } from "./asset.model.js";
import { AssetAssignment } from "./assetAssignment.model.js";
import { AssetEvent } from "./assetEvent.model.js";
import { assetAccessFilter, canManageAssets, assetView } from "./asset.policy.js";
import { serializeAsset, serializeCustody, safeAssetSnapshot } from "./asset.serializer.js";
import { mutateCustody, activeCustody, assertCustodyInvariant, assetConflict } from "./assetCustody.service.js";
import { activeSelectionService, selectionFilter } from "./assetSelection.service.js";
import { currentAccess } from "../access/currentAccess.service.js";
import { Department } from "../organization/department.model.js";
import { Location } from "../organization/location.model.js";
import { Ticket } from "../tickets/ticket.model.js";
import { buildTicketAccessFilter } from "../tickets/ticket.policy.js";
import { recordRequiredAuditEvent } from "../auth/audit.service.js";
import { OutboxEvent } from "../outbox/outboxEvent.model.js";
import { executeCommand } from "../../shared/database/command.js";
import { AppError } from "../../shared/errors/app-error.js";
import { idOf, same } from "../../shared/validation/commands.js";
function notFound() {
  return new AppError(404, "ASSET_NOT_FOUND", "Asset was not found.");
}
function requireManage(auth, department) {
  if (!canManageAssets(auth, department)) throw new AppError(403, "ASSET_SCOPE_REQUIRED", "Current asset_manage scope is required.");
}
async function accessibleAsset(auth, id, session = null) {
  if (!mongoose.isObjectIdOrHexString(id)) throw notFound();
  const asset = await Asset.findOne({
    $and: [{
      _id: id
    }, await assetAccessFilter(auth, session)]
  }).session(session);
  if (!asset) throw notFound();
  return asset;
}
async function references(auth, departmentId, locationId, session) {
  const department = await Department.findOne({
    _id: departmentId,
    organization: auth.user.organizationId,
    isActive: true
  }).session(session);
  if (!department) throw new AppError(422, "DEPARTMENT_UNAVAILABLE", "An active department in this organization is required.");
  const location = locationId && (await Location.findOne({
    _id: locationId,
    organization: auth.user.organizationId,
    department: departmentId,
    isActive: true
  }).session(session));
  if (locationId && !location) throw new AppError(422, "LOCATION_UNAVAILABLE", "Location must belong to the asset department.");
  return {
    department,
    location: location || null
  };
}
async function recordChange(auth, asset, type, data, metadata, session) {
  await AssetEvent.create([{
    organization: asset.organization,
    asset: asset._id,
    actor: auth.user.id,
    type,
    data,
    occurredAt: new Date()
  }], {
    session
  });
  await recordRequiredAuditEvent({
    eventType: `ASSET_${type}`,
    outcome: "SUCCESS",
    organization: asset.organization,
    department: asset.department,
    user: auth.user.id,
    session: auth.session.id,
    asset: asset._id,
    ...metadata
  }, session);
  await OutboxEvent.create([{
    organization: asset.organization,
    aggregateType: "ASSET",
    aggregateId: asset._id,
    eventType: `ASSET_${type}`,
    visibility: "ASSET_MANAGERS",
    requiresAuthorization: true,
    recipients: {
      userIds: [],
      capability: "asset_manage",
      department: asset.department
    },
    payload: {
      assetId: idOf(asset)
    },
    status: "PENDING"
  }], {
    session
  });
}
export async function assetCommand({
  authentication,
  assetId,
  action,
  input,
  idempotencyKey,
  metadata
}) {
  return executeCommand({
    authentication,
    operation: `asset:${action}${assetId ? `:${assetId}` : ""}`,
    key: idempotencyKey,
    input,
    resourceType: "ASSET",
    status: action === "create" ? 201 : 200,
    read: async id => ({
      asset: await getAsset(authentication, id)
    }),
    work: async session => {
      const auth = await currentAccess(authentication, session);
      let asset;
      if (action === "create") {
        requireManage(auth, input.departmentId);
        await references(auth, input.departmentId, input.locationId, session);
        const {
          departmentId,
          locationId,
          ...values
        } = input;
        if (values.purchaseDate && values.warrantyEndDate && values.warrantyEndDate < values.purchaseDate) throw new AppError(400, "VALIDATION_ERROR", "Warranty cannot end before purchase.");
        [asset] = await Asset.create([{
          ...values,
          organization: auth.user.organizationId,
          creator: auth.user.id,
          department: departmentId,
          location: locationId || null,
          version: 0,
          status: "AVAILABLE"
        }], {
          session
        });
        await recordChange(auth, asset, "CREATED", {
          assetTag: asset.assetTag
        }, metadata, session);
        return asset._id;
      }
      asset = await accessibleAsset(auth, assetId, session);
      requireManage(auth, asset.department);
      if (asset.version !== input.expectedVersion) throw new AppError(409, "STALE_ASSET_VERSION", "The asset changed. Refresh it and retry.");
      if (asset.status === "RETIRED") assetConflict("Retired assets cannot be changed.");
      let set, data, type;
      const {
        department,
        location
      } = await references(auth, input.departmentId || asset.department, input.locationId !== undefined ? input.locationId : asset.location, session);
      if (action === "patch") {
        assertCustodyInvariant(asset, await activeCustody(asset, session));
        const {
          expectedVersion,
          reason,
          departmentId,
          locationId,
          ...values
        } = input;
        set = {
          ...values
        };
        data = {
          changes: {},
          ...(reason ? {
            reason
          } : {})
        };
        type = "UPDATED";
        if (departmentId && !same(departmentId, asset.department)) {
          requireManage(auth, departmentId);
          if (!reason) throw new AppError(400, "REASON_REQUIRED", "A department correction requires a reason.");
          if (await AssetAssignment.exists({
            organization: asset.organization,
            asset: asset._id
          }).session(session)) assetConflict("Department transfers are deferred once custody history exists.");
          set.department = departmentId;
        }
        if (locationId !== undefined) set.location = locationId;
        const purchase = Object.hasOwn(values, "purchaseDate") ? values.purchaseDate : asset.purchaseDate;
        const warranty = Object.hasOwn(values, "warrantyEndDate") ? values.warrantyEndDate : asset.warrantyEndDate;
        if (purchase && warranty && warranty < purchase) throw new AppError(400, "VALIDATION_ERROR", "Warranty cannot end before purchase.");
        for (const [key, after] of Object.entries(set)) data.changes[key] = {
          before: asset[key] ?? null,
          after
        };
      } else {
        ({
          set,
          data
        } = await mutateCustody({
          action,
          input,
          asset,
          auth,
          department,
          location,
          session
        }));
        type = {
          assign: "ASSIGNED",
          return: "RETURNED",
          state: "STATE_CHANGED"
        }[action];
        Object.assign(data, {
          previousStatus: asset.status,
          status: set.status
        });
      }
      const updated = await Asset.findOneAndUpdate({
        _id: asset._id,
        organization: asset.organization,
        version: input.expectedVersion,
        status: asset.status
      }, {
        $set: set,
        $inc: {
          version: 1
        }
      }, {
        session,
        returnDocument: "after",
        runValidators: true
      });
      if (!updated) assetConflict("A competing operation changed the asset.");
      assertCustodyInvariant(updated, await activeCustody(updated, session));
      await recordChange(auth, updated, type, data, metadata, session);
      return updated._id;
    }
  });
}
export async function getAsset(authentication, assetId) {
  const auth = await currentAccess(authentication),
    asset = await accessibleAsset(auth, assetId),
    view = assetView(auth, asset);
  const result = serializeAsset(auth, asset);
  const custody = await activeCustody(asset);
  if (view === "MANAGER" && custody) result.currentCustody = serializeCustody(custody);
  if (view === "OWN" && custody && same(custody.custodian, auth.user.id)) result.myAssignment = {
    assignedAt: custody.assignedAt,
    department: custody.departmentSnapshot,
    location: custody.locationSnapshot
  };
  return result;
}
function queryClauses(filters) {
  const clauses = [];
  if (filters.departmentId) clauses.push({
    department: filters.departmentId
  });
  for (const key of ["category", "status"]) if (filters[key]) clauses.push({
    [key]: filters[key]
  });
  if (filters.search) {
    const pattern = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu");
    clauses.push({
      $or: [{
        assetTag: pattern
      }, {
        serialNumber: pattern
      }]
    });
  }
  return clauses;
}
export async function listAssets(authentication, filters, selectable = false) {
  const auth = await currentAccess(authentication);
  const access = selectable ? await selectionFilter(auth, await activeSelectionService(auth, filters.serviceItemId), filters.locationId) : await assetAccessFilter(auth);
  const filter = {
    $and: [access, ...queryClauses(filters)]
  };
  const [rows, total] = await Promise.all([Asset.find(filter).sort({
    assetTag: 1,
    _id: 1
  }).skip((filters.page - 1) * filters.limit).limit(filters.limit), Asset.countDocuments(filter)]);
  return {
    assets: rows.map(asset => selectable ? safeAssetSnapshot(asset) : serializeAsset(auth, asset)),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit)
    }
  };
}
export async function assetHistory(authentication, assetId, kind, pagination) {
  const auth = await currentAccess(authentication),
    asset = await accessibleAsset(auth, assetId);
  if (kind !== "tickets" && !canManageAssets(auth, asset.department)) throw notFound();
  let Model, filter, sort;
  if (kind === "tickets") {
    Model = Ticket;
    filter = {
      $and: [buildTicketAccessFilter(auth), {
        "assetSnapshots.assetId": idOf(asset)
      }, ...(assetView(auth, asset) === "OWN" ? [{
        requester: auth.user.id
      }] : [])]
    };
    sort = {
      submittedAt: -1,
      _id: -1
    };
  } else {
    Model = kind === "custody" ? AssetAssignment : AssetEvent;
    filter = {
      organization: asset.organization,
      asset: asset._id
    };
    sort = kind === "custody" ? {
      assignedAt: -1,
      _id: -1
    } : {
      occurredAt: -1,
      _id: -1
    };
  }
  const [rows, total] = await Promise.all([Model.find(filter).sort(sort).skip((pagination.page - 1) * pagination.limit).limit(pagination.limit), Model.countDocuments(filter)]);
  const records = [];
  for (const row of rows) {
    if (kind === "custody") records.push(serializeCustody(row));else if (kind === "tickets") records.push({
      id: idOf(row),
      reference: row.reference,
      title: row.title,
      status: row.status
    });else {
      const data = structuredClone(row.data);
      if (data.ticketId && !(await Ticket.exists({
        $and: [buildTicketAccessFilter(auth), {
          _id: data.ticketId
        }]
      }))) delete data.ticketId;
      records.push({
        id: idOf(row),
        actorId: idOf(row.actor),
        type: row.type,
        data,
        occurredAt: row.occurredAt
      });
    }
  }
  return {
    [kind]: records,
    pagination: {
      ...pagination,
      total,
      totalPages: Math.ceil(total / pagination.limit)
    }
  };
}
