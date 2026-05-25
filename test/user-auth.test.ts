import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "@/app/lib/server/auth";

describe("user auth helpers", () => {
  test("hashes and verifies a password", async () => {
    const password = "correct horse battery staple";

    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  test("creates opaque session tokens and stable token hashes", () => {
    const token = createSessionToken();

    expect(token).toHaveLength(64);
    expect(createSessionToken()).not.toBe(token);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
  });
});
