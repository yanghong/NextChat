import {
  shouldAllowModelProxyRequest,
  shouldRequireBoundOpenAIKey,
} from "@/app/api/auth";
import { ModelProvider } from "@/app/constant";

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

  test("requires bound OpenAI key for logged-in GPT requests", () => {
    expect(
      shouldRequireBoundOpenAIKey({
        modelProvider: ModelProvider.GPT,
        hasUserSession: true,
        hasBoundUserApiKey: false,
      }),
    ).toBe(true);
  });

  test("does not require bound OpenAI key for anonymous GPT requests", () => {
    expect(
      shouldRequireBoundOpenAIKey({
        modelProvider: ModelProvider.GPT,
        hasUserSession: false,
        hasBoundUserApiKey: false,
      }),
    ).toBe(false);
  });
});
