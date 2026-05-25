import { shouldAllowModelProxyRequest } from "@/app/api/auth";

describe("model proxy auth", () => {
  test("allows logged-in users when access code is enabled", () => {
    expect(
      shouldAllowModelProxyRequest({
        needCode: true,
        accessCodeValid: false,
        hasApiKey: false,
        hasUserSession: true,
      }),
    ).toBe(true);
  });

  test("rejects anonymous requests when access code is enabled", () => {
    expect(
      shouldAllowModelProxyRequest({
        needCode: true,
        accessCodeValid: false,
        hasApiKey: false,
        hasUserSession: false,
      }),
    ).toBe(false);
  });
});
