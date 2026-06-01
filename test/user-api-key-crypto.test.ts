import {
  decryptUserApiKey,
  encryptUserApiKey,
} from "@/app/lib/server/user-api-key-crypto";
import {
  deleteUserApiKey,
  getUserApiKey,
  hasUserApiKey,
  upsertUserApiKey,
} from "@/app/lib/server/user-api-key-repository";

describe("user api key crypto", () => {
  test("encrypts without storing plaintext and decrypts back", () => {
    const secret = "test-secret-for-user-api-key-encryption";
    const plaintext = "sk-test-123";

    const ciphertext = encryptUserApiKey(plaintext, secret);

    expect(ciphertext).not.toContain(plaintext);
    expect(decryptUserApiKey(ciphertext, secret)).toBe(plaintext);
  });

  test("requires an encryption secret", () => {
    expect(() => encryptUserApiKey("sk-test", "")).toThrow(
      "USER_API_KEY_ENCRYPTION_SECRET",
    );
  });
});

describe("user api key repository", () => {
  test("exposes user api key repository operations", () => {
    expect(typeof getUserApiKey).toBe("function");
    expect(typeof hasUserApiKey).toBe("function");
    expect(typeof upsertUserApiKey).toBe("function");
    expect(typeof deleteUserApiKey).toBe("function");
  });
});
