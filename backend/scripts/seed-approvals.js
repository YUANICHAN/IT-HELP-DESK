import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { createIndexes } from "./create-indexes.js";
import { runRequiredTransaction } from "../src/shared/database/transaction.js";
import { Organization } from "../src/modules/organization/organization.model.js";
import { Department } from "../src/modules/organization/department.model.js";
import { User } from "../src/modules/users/user.model.js";
import { hashPassword } from "../src/modules/users/password.service.js";
import { AccessGrant } from "../src/modules/access/accessGrant.model.js";
import { BusinessCalendar } from "../src/modules/service-levels/businessCalendar.model.js";
import { SlaPolicy } from "../src/modules/service-levels/slaPolicy.model.js";
import { ServiceItem } from "../src/modules/catalog/serviceItem.model.js";
try {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 16) throw new Error("Set DEMO_PASSWORD to a unique password of at least 16 characters.");
  await connectDatabase();
  if (mongoose.connection.name !== "it_help_desk_demo_step8") throw new Error("Synthetic seed only permits database it_help_desk_demo_step8.");
  await createIndexes();
  const passwordHash = await hashPassword(password);
  const organizationId = await runRequiredTransaction(async session => {
    const existing = await Organization.findOne({
      name: "Synthetic Step 8"
    }).session(session);
    if (existing) return existing._id;
    const [org] = await Organization.create([{
      name: "Synthetic Step 8",
      organizationType: "COMPANY",
      supportEmail: "support@approvals.example"
    }], {
      session
    });
    const [department, unconfigured] = await Department.create([{
      organization: org._id,
      code: "OPS",
      name: "Operations"
    }, {
      organization: org._id,
      code: "UNCONFIGURED",
      name: "Configuration failure demonstration"
    }], {
      session,
      ordered: true
    });
    const users = {};
    for (const [name, role] of [["admin", "ADMINISTRATOR"], ["employee", "EMPLOYEE"], ["other", "EMPLOYEE"], ["technician", "TECHNICIAN"], ["primary", "SUPERVISOR"], ["backup", "SUPERVISOR"], ["triage", "SUPERVISOR"]]) {
      [users[name]] = await User.create([{
        organization: org._id,
        department: name === "other" ? unconfigured._id : department._id,
        displayName: `Demo ${name}`,
        email: `${name}@approvals.example`,
        role,
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        passwordHash
      }], {
        session
      });
    }
    for (const [name, capability] of [["primary", "department_supervise"], ["backup", "department_supervise"], ["triage", "ticket_triage"], ["triage", "asset_manage"], ["technician", "support"]]) {
      await AccessGrant.create([{
        organization: org._id,
        user: users[name]._id,
        capability,
        department: department._id,
        grantedBy: users.admin._id
      }], {
        session
      });
    }
    department.designatedApprover = users.primary._id;
    await department.save({
      session
    });
    org.backupApprover = users.backup._id;
    await org.save({
      session
    });
    const [calendar] = await BusinessCalendar.create([{
      organization: org._id,
      name: "Manila weekdays",
      timezone: "Asia/Manila",
      weeklyWindows: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map(day => ({
        day,
        start: "08:00",
        end: "17:00"
      })),
      holidays: []
    }], {
      session
    });
    const [policy] = await SlaPolicy.create([{
      organization: org._id,
      name: "Demo approval policy",
      businessCalendar: calendar._id,
      targets: Object.fromEntries(["P1", "P2", "P3", "P4"].map(priority => [priority, {
        responseMinutes: 60,
        resolutionMinutes: 480
      }]))
    }], {
      session
    });
    await ServiceItem.create([{
      organization: org._id,
      code: "ACCESS",
      name: "Approval-required access request",
      ticketType: "REQUEST",
      requiresApproval: true,
      slaPolicy: policy._id,
      assetPolicy: "NONE"
    }], {
      session
    });
    return org._id;
  });
  const department = await Department.findOne({
    organization: organizationId,
    code: "OPS"
  });
  const service = await ServiceItem.findOne({
    organization: organizationId,
    code: "ACCESS"
  });
  const users = await User.find({
    organization: organizationId
  }).select("email role").lean();
  console.log(JSON.stringify({
    organizationId,
    departmentId: department.id,
    serviceItemId: service.id,
    primaryApproverId: department.designatedApprover,
    backupApproverId: (await Organization.findById(organizationId)).backupApprover,
    users: users.map(user => ({
      id: user._id,
      email: user.email,
      role: user.role
    }))
  }, null, 2));
} finally {
  await disconnectDatabase();
}
