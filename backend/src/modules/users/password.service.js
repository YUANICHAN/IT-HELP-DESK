import * as crypto from "node:crypto";

const ARGON2_VERSION = 19;
const ARGON2_PARAMETERS = Object.freeze({
  memory: 65536,
  passes: 3,
  parallelism: 1,
  tagLength: 32,
});

export const PASSWORD_POLICY = Object.freeze({
  minimumCharacters: 12,
  maximumCharacters: 128,
  maximumBytes: 1024,
});

function encodeBase64(value) {
  return value.toString("base64").replace(/=+$/u, "");
}

function decodeBase64(value) {
  return Buffer.from(value, "base64");
}

function parseArgon2idHash(encodedHash) {
  if (typeof encodedHash !== "string") return null;

  const match = encodedHash.match(
    /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+={0,2})\$([A-Za-z0-9+/]+={0,2})$/u,
  );

  if (!match) return null;

  const [, version, memory, passes, parallelism, salt, expectedHash] = match;
  const parameters = {
    version: Number(version),
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    salt: decodeBase64(salt),
    expectedHash: decodeBase64(expectedHash),
  };

  if (
    parameters.version !== ARGON2_VERSION ||
    !Number.isInteger(parameters.memory) ||
    parameters.memory < 8 ||
    parameters.memory > 1048576 ||
    !Number.isInteger(parameters.passes) ||
    parameters.passes < 1 ||
    parameters.passes > 20 ||
    !Number.isInteger(parameters.parallelism) ||
    parameters.parallelism < 1 ||
    parameters.parallelism > 16 ||
    parameters.salt.length < 8 ||
    parameters.expectedHash.length < 16 ||
    parameters.expectedHash.length > 128
  ) {
    return null;
  }

  return parameters;
}

export function validateNewPassword(password) {
  if (typeof password !== "string") {
    throw new Error("Password must be a string.");
  }

  const characterLength = [...password].length;

  if (characterLength < PASSWORD_POLICY.minimumCharacters) {
    throw new Error(
      `Password must contain at least ${PASSWORD_POLICY.minimumCharacters} characters.`,
    );
  }

  if (characterLength > PASSWORD_POLICY.maximumCharacters) {
    throw new Error(
      `Password cannot exceed ${PASSWORD_POLICY.maximumCharacters} characters.`,
    );
  }

  if (Buffer.byteLength(password, "utf8") > PASSWORD_POLICY.maximumBytes) {
    throw new Error("Password is too long when UTF-8 encoded.");
  }
}

export async function hashPassword(password) {
  if (typeof crypto.argon2 !== "function") {
    throw new Error(
      "This Node.js version does not provide the required Argon2id implementation.",
    );
  }

  validateNewPassword(password);

  const salt = crypto.randomBytes(16);
  const passwordBytes = Buffer.from(password, "utf8");

  try {
    const derivedKey = await new Promise((resolve, reject) => {
      crypto.argon2(
        "argon2id",
        {
          message: passwordBytes,
          nonce: salt,
          ...ARGON2_PARAMETERS,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
    });

    return [
      "$argon2id",
      `v=${ARGON2_VERSION}`,
      `m=${ARGON2_PARAMETERS.memory},t=${ARGON2_PARAMETERS.passes},p=${ARGON2_PARAMETERS.parallelism}`,
      encodeBase64(salt),
      encodeBase64(derivedKey),
    ].join("$");
  } finally {
    passwordBytes.fill(0);
  }
}

export async function verifyPassword(password, encodedHash) {
  if (
    typeof crypto.argon2 !== "function" ||
    typeof password !== "string" ||
    Buffer.byteLength(password, "utf8") > PASSWORD_POLICY.maximumBytes
  ) {
    return false;
  }

  const parsedHash = parseArgon2idHash(encodedHash);
  if (!parsedHash) return false;

  const passwordBytes = Buffer.from(password, "utf8");

  try {
    const derivedKey = await new Promise((resolve, reject) => {
      crypto.argon2(
        "argon2id",
        {
          message: passwordBytes,
          nonce: parsedHash.salt,
          memory: parsedHash.memory,
          passes: parsedHash.passes,
          parallelism: parsedHash.parallelism,
          tagLength: parsedHash.expectedHash.length,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
    });

    return (
      derivedKey.length === parsedHash.expectedHash.length &&
      crypto.timingSafeEqual(derivedKey, parsedHash.expectedHash)
    );
  } catch {
    return false;
  } finally {
    passwordBytes.fill(0);
  }
}
