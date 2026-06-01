import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const CIPHER_VERSION = "v1";
const IV_BYTES = 12;

function deriveKey(secret: string) {
  if (!secret.trim()) {
    throw new Error("USER_API_KEY_ENCRYPTION_SECRET is not configured");
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptUserApiKey(plaintext: string, secret: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    CIPHER_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptUserApiKey(ciphertext: string, secret: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = ciphertext.split(":");
  if (version !== CIPHER_VERSION || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Unsupported user API key ciphertext");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
