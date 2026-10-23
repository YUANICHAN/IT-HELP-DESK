import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import {
  connectDatabase,
  disconnectDatabase,
} from "../src/config/database.js";
import { AccessGrant } from "../src/modules/access/accessGrant.model.js";
import { Department } from "../src/modules/organization/department.model.js";
import { Location } from "../src/modules/organization/location.model.js";
import {
  ORGANIZATION_TYPES,
  Organization,
} from "../src/modules/organization/organization.model.js";
import { hashPassword } from "../src/modules/users/password.service.js";
import { User } from "../src/modules/users/user.model.js";
import { objectIdsEqual } from "../src/shared/validation/organization-reference.js";

const PLACEHOLDER_PASSWORD = "replace-with-a-strong-unique-password";

class BootstrapConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "BootstrapConflictError";
  }
}

function requireEnvironmentValue(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for administrator bootstrap.`);
  }

  return value;
}

function optionalEnvironmentValue(name) {
  return process.env[name]?.trim() || undefined;
}

function readBootstrapConfiguration() {
  const organizationType = requireEnvironmentValue(
    "BOOTSTRAP_ORGANIZATION_TYPE",
  ).toUpperCase();

  if (!ORGANIZATION_TYPES.includes(organizationType)) {
    throw new Error(
      "BOOTSTRAP_ORGANIZATION_TYPE must be COMPANY or GOVERNMENT.",
    );
  }

  const password = requireEnvironmentValue("BOOTSTRAP_ADMIN_PASSWORD");

  if (password === PLACEHOLDER_PASSWORD) {
    throw new Error(
      "BOOTSTRAP_ADMIN_PASSWORD must be replaced with a unique password.",
    );
  }

  if (password.length < 12) {
    throw new Error(
      "BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters.",
    );
  }

  return {
    organization: {
      name: requireEnvironmentValue("BOOTSTRAP_ORGANIZATION_NAME"),
      organizationType,
      timezone:
        optionalEnvironmentValue("BOOTSTRAP_ORGANIZATION_TIMEZONE") ||
        "Asia/Manila",
      supportEmail: requireEnvironmentValue(
        "BOOTSTRAP_ORGANIZATION_SUPPORT_EMAIL",
      ).toLowerCase(),
      isActive: true,
    },
    department: {
      code: requireEnvironmentValue("BOOTSTRAP_DEPARTMENT_CODE").toUpperCase(),
      name: requireEnvironmentValue("BOOTSTRAP_DEPARTMENT_NAME"),
      isActive: true,
    },
    administrator: {
      displayName: requireEnvironmentValue("BOOTSTRAP_ADMIN_DISPLAY_NAME"),
      email: requireEnvironmentValue("BOOTSTRAP_ADMIN_EMAIL").toLowerCase(),
      employeeNumber: optionalEnvironmentValue(
        "BOOTSTRAP_ADMIN_EMPLOYEE_NUMBER",
      )?.toUpperCase(),
      phone: optionalEnvironmentValue("BOOTSTRAP_ADMIN_PHONE"),
      password,
    },
  };
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function assertEqual(actual, expected, description) {
  if (actual !== expected) {
    throw new BootstrapConflictError(
      `Existing ${description} conflicts with the bootstrap configuration.`,
    );
  }
}

function normalizedString(value) {
  return value?.trim().toLowerCase();
}

async function findOrganization(configuration) {
  const matches = await Organization.find({
    name: {
      $regex: `^${escapeRegularExpression(configuration.name)}$`,
      $options: "i",
    },
  });

  if (matches.length > 1) {
    throw new BootstrapConflictError(
      "More than one organization matches BOOTSTRAP_ORGANIZATION_NAME.",
    );
  }

  const organization = matches[0];
  if (!organization) return null;

  assertEqual(
    organization.organizationType,
    configuration.organizationType,
    "organization type",
  );
  assertEqual(
    organization.timezone,
    configuration.timezone,
    "organization timezone",
  );
  assertEqual(
    normalizedString(organization.supportEmail),
    normalizedString(configuration.supportEmail),
    "organization support email",
  );
  assertEqual(organization.isActive, true, "organization active status");

  return organization;
}

async function findDepartment(organizationId, configuration) {
  const department = await Department.findOne({
    organization: organizationId,
    code: configuration.code,
  });

  if (!department) return null;

  assertEqual(department.name, configuration.name, "department name");
  assertEqual(department.isActive, true, "department active status");

  return department;
}

async function findAdministrator(
  organizationId,
  departmentId,
  configuration,
) {
  const administrator = await User.findOne({
    organization: organizationId,
    email: configuration.email,
  }).select("+passwordHash");

  if (!administrator) return null;

  if (!objectIdsEqual(administrator.department, departmentId)) {
    throw new BootstrapConflictError(
      "Existing administrator email belongs to a different department.",
    );
  }

  assertEqual(
    administrator.displayName,
    configuration.displayName,
    "administrator display name",
  );
  assertEqual(administrator.role, "ADMINISTRATOR", "administrator role");
  assertEqual(
    administrator.accountStatus,
    "ACTIVE",
    "administrator account status",
  );

  if (!administrator.passwordHash) {
    throw new BootstrapConflictError(
      "Existing active administrator does not have a password hash.",
    );
  }

  if (
    configuration.employeeNumber &&
    administrator.employeeNumber !== configuration.employeeNumber
  ) {
    throw new BootstrapConflictError(
      "Existing administrator employee number conflicts with the bootstrap configuration.",
    );
  }

  if (configuration.phone && administrator.phone !== configuration.phone) {
    throw new BootstrapConflictError(
      "Existing administrator phone conflicts with the bootstrap configuration.",
    );
  }

  return administrator;
}

async function rollbackCreatedRecords(createdRecords) {
  const failures = [];

  for (const record of [...createdRecords].reverse()) {
    try {
      await record.Model.deleteOne({ _id: record.id });
    } catch {
      failures.push(record.label);
    }
  }

  return failures;
}

export async function bootstrapAdministrator(configuration) {
  for (const Model of [
    Organization,
    Department,
    Location,
    User,
    AccessGrant,
  ]) {
    try {
      await Model.createIndexes();
    } catch (error) {
      throw new Error(`Could not initialize ${Model.modelName} indexes.`, {
        cause: error,
      });
    }
  }

  let organization = await findOrganization(configuration.organization);
  const organizationId = organization?._id ?? new mongoose.Types.ObjectId();

  let department = organization
    ? await findDepartment(organizationId, configuration.department)
    : null;
  const departmentId = department?._id ?? new mongoose.Types.ObjectId();

  let administrator = organization
    ? await findAdministrator(
        organizationId,
        departmentId,
        configuration.administrator,
      )
    : null;

  if (!administrator && configuration.administrator.employeeNumber) {
    const employeeNumberOwner = await User.exists({
      organization: organizationId,
      employeeNumber: configuration.administrator.employeeNumber,
    });

    if (employeeNumberOwner) {
      throw new BootstrapConflictError(
        "Administrator employee number is already assigned in this organization.",
      );
    }
  }

  const passwordHash = administrator
    ? null
    : await hashPassword(configuration.administrator.password);

  const createdRecords = [];

  try {
    if (!organization) {
      organization = await Organization.create({
        _id: organizationId,
        ...configuration.organization,
      });
      createdRecords.push({
        Model: Organization,
        id: organization._id,
        label: "organization",
      });
    }

    if (!department) {
      department = await Department.create({
        _id: departmentId,
        organization: organization._id,
        ...configuration.department,
      });
      createdRecords.push({
        Model: Department,
        id: department._id,
        label: "department",
      });
    }

    if (!administrator) {
      administrator = await User.create({
        organization: organization._id,
        department: department._id,
        displayName: configuration.administrator.displayName,
        email: configuration.administrator.email,
        employeeNumber: configuration.administrator.employeeNumber,
        phone: configuration.administrator.phone,
        passwordHash,
        role: "ADMINISTRATOR",
        accountStatus: "ACTIVE",
        mustChangePassword: true,
      });
      createdRecords.push({
        Model: User,
        id: administrator._id,
        label: "administrator",
      });
    }

    return {
      organization: createdRecords.some(
        (record) => record.Model === Organization,
      )
        ? "created"
        : "reused",
      department: createdRecords.some((record) => record.Model === Department)
        ? "created"
        : "reused",
      administrator: createdRecords.some((record) => record.Model === User)
        ? "created"
        : "reused",
    };
  } catch (error) {
    const rollbackFailures = await rollbackCreatedRecords(createdRecords);

    if (rollbackFailures.length > 0) {
      throw new Error(
        `Bootstrap failed and automatic cleanup was incomplete for: ${rollbackFailures.join(
          ", ",
        )}.`,
        { cause: error },
      );
    }

    throw error;
  }
}

export async function runBootstrap() {
  let connected = false;
  let failure = null;

  try {
    const configuration = readBootstrapConfiguration();
    await connectDatabase();
    connected = true;

    const result = await bootstrapAdministrator(configuration);

    console.log("Administrator bootstrap completed.");
    console.log(`Organization: ${result.organization}.`);
    console.log(`Department: ${result.department}.`);
    console.log(`Administrator: ${result.administrator}.`);
  } catch (error) {
    failure = error;
    process.exitCode = 1;
    console.error(`Administrator bootstrap failed: ${error.message}`);
  } finally {
    if (connected) {
      try {
        await disconnectDatabase();
      } catch (error) {
        failure = failure || error;
        process.exitCode = 1;
        console.error("Administrator bootstrap failed while closing MongoDB.");
      }
    }
  }

  return failure == null;
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  await runBootstrap();
}
