import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { bootstrapAdministrator } from "../scripts/bootstrap-admin.js";
import { AccessGrant } from "../src/modules/access/accessGrant.model.js";
import { Department } from "../src/modules/organization/department.model.js";
import { Location } from "../src/modules/organization/location.model.js";
import { Organization } from "../src/modules/organization/organization.model.js";
import { hashPassword } from "../src/modules/users/password.service.js";
import { User } from "../src/modules/users/user.model.js";
import { isolatedDatabaseUri } from "./support/database.js";

async function dropIsolatedDatabase() {
  const databaseName = mongoose.connection.db.databaseName;

  assert.match(databaseName, /^it_help_desk_test_/u);
  await mongoose.connection.dropDatabase();
}

async function synchronizeIndexes() {
  await Promise.all([
    Organization.syncIndexes(),
    Department.syncIndexes(),
    Location.syncIndexes(),
    User.syncIndexes(),
    AccessGrant.syncIndexes(),
  ]);
}

async function expectDuplicate(operation) {
  await assert.rejects(operation, (error) => error?.code === 11000);
}

async function testModelInvariants() {
  try {
    await synchronizeIndexes();

    const organization = await Organization.create({
      name: "Foundation Test Company",
      organizationType: "COMPANY",
      supportEmail: "SUPPORT@EXAMPLE.COM",
    });
    const otherOrganization = await Organization.create({
      name: "Other Test Agency",
      organizationType: "GOVERNMENT",
      supportEmail: "help@agency.example",
    });

    assert.equal(organization.timezone, "Asia/Manila");
    assert.equal(organization.supportEmail, "support@example.com");

    const department = await Department.create({
      organization: organization._id,
      code: "it",
      name: "Information Technology",
    });
    const otherDepartment = await Department.create({
      organization: otherOrganization._id,
      code: "IT",
      name: "Agency IT",
    });

    assert.equal(department.code, "IT");

    await expectDuplicate(
      Department.create({
        organization: organization._id,
        code: "IT",
        name: "Duplicate IT",
      }),
    );

    await assert.rejects(
      new Location({
        organization: organization._id,
        department: otherDepartment._id,
        code: "HQ",
        name: "Headquarters",
      }).validate(),
      /same organization/u,
    );

    await Location.create({
      organization: organization._id,
      department: department._id,
      code: "HQ",
      name: "Headquarters",
    });

    await expectDuplicate(
      Location.create({
        organization: organization._id,
        department: department._id,
        code: "hq",
        name: "Duplicate Headquarters",
      }),
    );

    await assert.rejects(
      User.create({
        organization: organization._id,
        department: department._id,
        displayName: "Active Without Password",
        email: "no-password@example.com",
        role: "EMPLOYEE",
        accountStatus: "ACTIVE",
      }),
      /requires a password hash/u,
    );

    await assert.rejects(
      User.create({
        organization: organization._id,
        department: department._id,
        displayName: "Invalid Role",
        email: "invalid-role@example.com",
        role: "OWNER",
      }),
      /Role is not supported/u,
    );

    await assert.rejects(
      User.create({
        organization: organization._id,
        department: otherDepartment._id,
        displayName: "Wrong Department",
        email: "wrong-department@example.com",
      }),
      /same organization/u,
    );

    const passwordHash = await hashPassword("Foundation-Test-Password-1!");
    assert.match(passwordHash, /^\$argon2id\$/u);

    const administrator = await User.create({
      organization: organization._id,
      department: department._id,
      displayName: "Test Administrator",
      email: "ADMIN@EXAMPLE.COM",
      passwordHash,
      role: "ADMINISTRATOR",
      accountStatus: "ACTIVE",
    });
    const technician = await User.create({
      organization: organization._id,
      department: department._id,
      displayName: "Test Technician",
      email: "technician@example.com",
      employeeNumber: "EMP-100",
      passwordHash,
      role: "TECHNICIAN",
      accountStatus: "ACTIVE",
    });
    const supervisor = await User.create({
      organization: organization._id,
      department: department._id,
      displayName: "Test Supervisor",
      email: "supervisor@example.com",
      passwordHash,
      role: "SUPERVISOR",
      accountStatus: "ACTIVE",
    });
    const otherAdministrator = await User.create({
      organization: otherOrganization._id,
      department: otherDepartment._id,
      displayName: "Other Administrator",
      email: "admin@agency.example",
      passwordHash,
      role: "ADMINISTRATOR",
      accountStatus: "ACTIVE",
    });

    await User.create([
      {
        organization: organization._id,
        department: department._id,
        displayName: "Invited One",
        email: "invited-one@example.com",
        accountStatus: "INVITED",
      },
      {
        organization: organization._id,
        department: department._id,
        displayName: "Invited Two",
        email: "invited-two@example.com",
        accountStatus: "INVITED",
      },
    ]);

    assert.equal(administrator.email, "admin@example.com");

    await expectDuplicate(
      User.create({
        organization: organization._id,
        department: department._id,
        displayName: "Duplicate Email",
        email: "ADMIN@example.com",
        accountStatus: "INVITED",
      }),
    );
    await expectDuplicate(
      User.create({
        organization: organization._id,
        department: department._id,
        displayName: "Duplicate Employee Number",
        email: "another-technician@example.com",
        employeeNumber: "emp-100",
        accountStatus: "INVITED",
      }),
    );

    const normalQuery = await User.findById(administrator._id).lean();
    assert.equal(normalQuery.passwordHash, undefined);

    const explicitlySelected = await User.findById(administrator._id).select(
      "+passwordHash",
    );
    assert.equal(explicitlySelected.passwordHash, passwordHash);
    assert.equal(explicitlySelected.toJSON().passwordHash, undefined);

    await assert.rejects(
      AccessGrant.create({
        organization: organization._id,
        user: technician._id,
        capability: "support",
        grantedBy: administrator._id,
      }),
      /requires a department scope/u,
    );

    await assert.rejects(
      AccessGrant.create({
        organization: organization._id,
        user: supervisor._id,
        capability: "support",
        department: department._id,
        grantedBy: administrator._id,
      }),
      /cannot be granted/u,
    );

    await assert.rejects(
      AccessGrant.create({
        organization: organization._id,
        user: administrator._id,
        capability: "asset_manage",
        grantedBy: administrator._id,
      }),
      /cannot be granted/u,
    );

    await assert.rejects(
      AccessGrant.create({
        organization: organization._id,
        user: technician._id,
        capability: "support",
        department: otherDepartment._id,
        grantedBy: administrator._id,
      }),
      /same organization/u,
    );

    await assert.rejects(
      AccessGrant.create({
        organization: organization._id,
        user: technician._id,
        capability: "support",
        department: department._id,
        grantedBy: otherAdministrator._id,
      }),
      /same organization/u,
    );

    const supportGrant = await AccessGrant.create({
      organization: organization._id,
      user: technician._id,
      capability: "support",
      department: department._id,
      grantedBy: administrator._id,
    });

    await expectDuplicate(
      AccessGrant.create({
        organization: organization._id,
        user: technician._id,
        capability: "support",
        department: department._id,
        grantedBy: administrator._id,
      }),
    );

    supportGrant.revokedBy = administrator._id;
    supportGrant.revokedAt = new Date();
    await supportGrant.save();

    await AccessGrant.create({
      organization: organization._id,
      user: technician._id,
      capability: "support",
      department: department._id,
      grantedBy: administrator._id,
    });

    await AccessGrant.create({
      organization: organization._id,
      user: supervisor._id,
      capability: "ticket_triage",
      grantedBy: administrator._id,
    });
    await AccessGrant.create({
      organization: organization._id,
      user: supervisor._id,
      capability: "department_supervise",
      department: department._id,
      grantedBy: administrator._id,
    });
    await AccessGrant.create({
      organization: organization._id,
      user: technician._id,
      capability: "asset_manage",
      grantedBy: administrator._id,
    });
  } finally {
    await AccessGrant.deleteMany({});
    await Location.deleteMany({});
    await User.deleteMany({});
    await Department.deleteMany({});
    await Organization.deleteMany({});
  }
}

async function testAdministratorBootstrap() {
  const password = "Bootstrap-Test-Password-1!";
  assert.equal(mongoose.connection.readyState, 1);
  assert.ok(mongoose.connection.db);
  for (const Model of [
    Organization,
    Department,
    Location,
    User,
    AccessGrant,
  ]) {
    assert.equal(Model.db.readyState, 1, Model.modelName);
    assert.ok(Model.db.db, Model.modelName);
  }

  const configuration = {
    organization: {
      name: "Bootstrap Test Company",
      organizationType: "COMPANY",
      timezone: "Asia/Manila",
      supportEmail: "support@bootstrap.example",
      isActive: true,
    },
    department: {
      code: "IT",
      name: "Information Technology",
      isActive: true,
    },
    administrator: {
      displayName: "Bootstrap Administrator",
      email: "admin@bootstrap.example",
      employeeNumber: "BOOT-001",
      phone: "+63 900 000 0000",
      password,
    },
  };

  const firstRun = await bootstrapAdministrator(configuration);
  assert.deepEqual(firstRun, {
    organization: "created",
    department: "created",
    administrator: "created",
  });

  let administrator = await User.findOne({
    email: "admin@bootstrap.example",
  }).select("+passwordHash");
  const originalPasswordHash = administrator.passwordHash;

  const secondRun = await bootstrapAdministrator(configuration);
  assert.deepEqual(secondRun, {
    organization: "reused",
    department: "reused",
    administrator: "reused",
  });

  assert.equal(await Organization.countDocuments(), 1);
  assert.equal(await Department.countDocuments(), 1);
  assert.equal(await User.countDocuments(), 1);
  assert.equal(await AccessGrant.countDocuments(), 0);
  administrator = await User.findOne({
    email: "admin@bootstrap.example",
  }).select("+passwordHash");
  assert.equal(administrator.passwordHash, originalPasswordHash);
  assert.equal(administrator.role, "ADMINISTRATOR");

  await assert.rejects(
    bootstrapAdministrator({
      ...configuration,
      organization: {
        ...configuration.organization,
        timezone: "UTC",
      },
    }),
    /conflicts/u,
  );
}

test("backend foundation", async (context) => {
  const databaseUri = isolatedDatabaseUri("foundation");
  await mongoose.connect(databaseUri);

  try {
    await context.test(
      "organization, user, location, and access-grant invariants",
      testModelInvariants,
    );
    await context.test(
      "administrator bootstrap is idempotent and conflict-safe",
      testAdministratorBootstrap,
    );
  } finally {
    await dropIsolatedDatabase();
    await mongoose.disconnect();
  }
});
