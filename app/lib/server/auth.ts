import { createHash, randomBytes, timingSafeEqual, pbkdf2 } from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(pbkdf2);

const PASSWORD_ALGORITHM = "pbkdf2-sha256";
const PASSWORD_ITERATIONS = 210000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const SESSION_TOKEN_BYTES = 32;

export type AuthUser = {
  id: number;
  email: string;
  name: string;
};

export const AUTH_COOKIE_NAME = "nextchat_session";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createSessionToken() {
  return randomBytes(SESSION_TOKEN_BYTES).toString("hex");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await pbkdf2Async(
    password,
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEY_LENGTH,
    PASSWORD_DIGEST,
  );

  return [
    PASSWORD_ALGORITHM,
    PASSWORD_ITERATIONS,
    salt,
    derivedKey.toString("hex"),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, salt, key] = storedHash.split("$");
  const iterations = Number(iterationsRaw);

  if (
    algorithm !== PASSWORD_ALGORITHM ||
    !Number.isInteger(iterations) ||
    !salt ||
    !key
  ) {
    return false;
  }

  const derivedKey = await pbkdf2Async(
    password,
    salt,
    iterations,
    Buffer.from(key, "hex").length,
    PASSWORD_DIGEST,
  );
  const storedKey = Buffer.from(key, "hex");

  return (
    storedKey.length === derivedKey.length &&
    timingSafeEqual(storedKey, derivedKey)
  );
}
