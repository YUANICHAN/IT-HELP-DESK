import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { createIndexes } from "./create-indexes.js";
import { runRequiredTransaction } from "../src/shared/database/transaction.js";
import { Organization } from "../src/modules/organization/organization.model.js";
import { Department } from "../src/modules/organization/department.model.js";
import { Location } from "../src/modules/organization/location.model.js";
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
  if (mongoose.connection.name !== "it_help_desk_demo_step67") throw new Error("Synthetic seed only permits database it_help_desk_demo_step67.");
  await createIndexes();
  const hash = await hashPassword(password);
  const organizationId = await runRequiredTransaction(async session => {
    const existing = await Organization.findOne({
      name: "Synthetic Step 6 and 7"
    }).session(session);
    if (existing) return existing._id;
    const [org] = await Organization.create([{
      name: "Synthetic Step 6 and 7",
      organizationType: "COMPANY",
      supportEmail: "support@demo.example"
    }], {
      session
    });
    const [department] = await Department.create([{
      organization: org._id,
      code: "OPS",
      name: "Operations"
    }], {
      session
    });
    await Location.create([{
      organization: org._id,
      department: department._id,
      code: "OPS-1",
      name: "Operations floor"
    }], {
      session
    });
    const users = {};
    for (const [name, role] of [["admin", "ADMINISTRATOR"], ["employee", "EMPLOYEE"], ["technician", "TECHNICIAN"], ["supervisor", "SUPERVISOR"]]) {
      [users[name]] = await User.create([{
        organization: org._id,
        department: department._id,
        displayName: `Demo ${name}`,
        email: `${name}@demo.example`,
        role,
        accountStatus: "ACTIVE",
        mustChangePassword: false,
        passwordHash: hash
      }], {
        session
      });
    }
    for (const [name, capability] of [["technician", "support"], ["supervisor", "ticket_triage"], ["supervisor", "asset_manage"]]) await AccessGrant.create([{
      organization: org._id,
      user: users[name]._id,
      capability,
      department: department._id,
      grantedBy: users.admin._id
    }], {
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
      name: "Demo support",
      businessCalendar: calendar._id,
      targets: {
        P1: {
          responseMinutes: 15,
          resolutionMinutes: 60
        },
        P2: {
          responseMinutes: 30,
          resolutionMinutes: 240
        },
        P3: {
          responseMinutes: 60,
          resolutionMinutes: 480
        },
        P4: {
          responseMinutes: 120,
          resolutionMinutes: 960
        }
      }
    }], {
      session
    });
    await ServiceItem.create([{
      organization: org._id,
      code: "EQUIPMENT",
      name: "Equipment incident",
      ticketType: "INCIDENT",
      requiresApproval: false,
      assetPolicy: "OWN_OR_SHARED_DEPARTMENT",
      slaPolicy: policy._id,
      configuration: {
        categories: ["HARDWARE", "SOFTWARE", "NETWORK", "ACCESS", "OTHER"]
      }
    }], {
      session
    });
    return org._id;
  });
  const department = await Department.findOne({
    organization: organizationId,
    code: "OPS"
  });
  const location = await Location.findOne({
    organization: organizationId,
    code: "OPS-1"
  });
  const service = await ServiceItem.findOne({
    organization: organizationId,
    code: "EQUIPMENT"
  });
  const users = await User.find({
    organization: organizationId
  }).select("email role").lean();
  console.log(JSON.stringify({
    organizationId,
    departmentId: department.id,
    locationId: location.id,
    serviceItemId: service.id,
    users: users.map(user => ({
      id: user._id,
      email: user.email,
      role: user.role
    }))
  }, null, 2));
} finally {
  await disconnectDatabase();
}
