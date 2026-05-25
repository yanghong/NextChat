import {
  applyOpenAIReasoningMode,
  supportsOpenAIReasoningMode,
} from "../app/utils/model-capabilities";

describe("OpenAI GPT reasoning mode", () => {
  test("adds high reasoning effort for GPT thinking mode", () => {
    const payload: any = { model: "gpt-5.5", messages: [] };

    applyOpenAIReasoningMode(payload, {
      model: "gpt-5.5",
      providerName: "OpenAI",
      reasoningMode: "thinking",
    });

    expect(payload.reasoning_effort).toBe("high");
  });

  test("does not send reasoning effort for instant mode", () => {
    const payload: any = { model: "gpt-5.5", messages: [] };

    applyOpenAIReasoningMode(payload, {
      model: "gpt-5.5",
      providerName: "OpenAI",
      reasoningMode: "instant",
    });

    expect(payload.reasoning_effort).toBeUndefined();
  });

  test("only shows the reasoning toggle for OpenAI GPT-5 text models", () => {
    expect(supportsOpenAIReasoningMode("gpt-5.5", "OpenAI")).toBe(true);
    expect(supportsOpenAIReasoningMode("gpt-5.5", "openai")).toBe(true);
    expect(supportsOpenAIReasoningMode("gpt-5.5", "gpt-5.5")).toBe(true);
    expect(supportsOpenAIReasoningMode("gpt-image-2", "OpenAI")).toBe(false);
    expect(supportsOpenAIReasoningMode("gpt-5.5", "Azure")).toBe(false);
  });
});
