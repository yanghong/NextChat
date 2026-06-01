import { getServerSideConfig } from "@/app/config/server";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { ensureAuthSchema, getDbPool } from "./db";
import { decryptUserApiKey, encryptUserApiKey } from "./user-api-key-crypto";

export const OPENAI_USER_API_KEY_PROVIDER = "openai";

type UserApiKeyRow = RowDataPacket & {
  api_key_ciphertext: string;
};

function getEncryptionSecret() {
  const secret = getServerSideConfig().userApiKeyEncryptionSecret ?? "";
  if (!secret.trim()) {
    throw new Error("USER_API_KEY_ENCRYPTION_SECRET is not configured");
  }
  return secret;
}

export async function getUserApiKey(userId: number, provider: string) {
  await ensureAuthSchema();
  const [rows] = await getDbPool().execute<UserApiKeyRow[]>(
    "SELECT api_key_ciphertext FROM user_api_keys WHERE user_id = ? AND provider = ? LIMIT 1",
    [userId, provider],
  );

  const row = rows[0];
  if (!row) return null;

  return decryptUserApiKey(row.api_key_ciphertext, getEncryptionSecret());
}

export async function hasUserApiKey(userId: number, provider: string) {
  await ensureAuthSchema();
  const [rows] = await getDbPool().execute<RowDataPacket[]>(
    "SELECT id FROM user_api_keys WHERE user_id = ? AND provider = ? LIMIT 1",
    [userId, provider],
  );

  return rows.length > 0;
}

export async function upsertUserApiKey(
  userId: number,
  provider: string,
  apiKey: string,
) {
  await ensureAuthSchema();
  const ciphertext = encryptUserApiKey(apiKey.trim(), getEncryptionSecret());
  await getDbPool().execute<ResultSetHeader>(
    `INSERT INTO user_api_keys (user_id, provider, api_key_ciphertext)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE api_key_ciphertext = VALUES(api_key_ciphertext)`,
    [userId, provider, ciphertext],
  );
}

export async function deleteUserApiKey(userId: number, provider: string) {
  await ensureAuthSchema();
  await getDbPool().execute<ResultSetHeader>(
    "DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?",
    [userId, provider],
  );
}
