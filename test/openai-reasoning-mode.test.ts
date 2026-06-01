import {
  applyOpenAIWebSearchTool,
  applyOpenAIReasoningMode,
  mergeChatTools,
  supportsOpenAIReasoningMode,
  supportsOpenAIWebSearch,
} from "../app/utils/model-capabilities";
import { readFileSync } from "fs";
import { join } from "path";

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

  test("defaults GPT reasoning mode to thinking", () => {
    const source = readFileSync(
      join(process.cwd(), "app/store/config.ts"),
      "utf8",
    );

    expect(source).toContain('reasoningMode: "thinking" as GptReasoningMode');
  });
});

describe("OpenAI web search tool", () => {
  test("adds web_search tool choice for supported OpenAI GPT models", () => {
    const payload: any = { model: "gpt-5.5", messages: [] };

    applyOpenAIWebSearchTool(payload, {
      model: "gpt-5.5",
      providerName: "OpenAI",
      webSearch: true,
      webSearchContextSize: "low",
    });

    expect(payload.tools).toEqual([
      { type: "web_search", search_context_size: "low" },
    ]);
    expect(payload.tool_choice).toEqual({ type: "web_search" });
  });

  test("defaults OpenAI web search to on", () => {
    const source = readFileSync(
      join(process.cwd(), "app/store/config.ts"),
      "utf8",
    );

    expect(source).toContain("webSearch: true");
  });

  test("does not add web_search for disabled search or Azure", () => {
    const disabledPayload: any = { model: "gpt-5.5", messages: [] };
    applyOpenAIWebSearchTool(disabledPayload, {
      model: "gpt-5.5",
      providerName: "OpenAI",
      webSearch: false,
    });
    expect(disabledPayload.tools).toBeUndefined();

    const azurePayload: any = { model: "gpt-5.5", messages: [] };
    applyOpenAIWebSearchTool(azurePayload, {
      model: "gpt-5.5",
      providerName: "Azure",
      webSearch: true,
    });
    expect(azurePayload.tools).toBeUndefined();
  });

  test("merges web_search with plugin tools for streamed requests", () => {
    const webSearchTool = { type: "web_search", search_context_size: "low" };
    const pluginTool = {
      type: "function",
      function: { name: "search_docs", parameters: {} },
    };

    expect(mergeChatTools([webSearchTool], [pluginTool])).toEqual([
      webSearchTool,
      pluginTool,
    ]);
  });

  test("only exposes web_search for OpenAI GPT text models", () => {
    expect(supportsOpenAIWebSearch("gpt-5.5", "OpenAI")).toBe(true);
    expect(supportsOpenAIWebSearch("gpt-image-2", "OpenAI")).toBe(false);
    expect(supportsOpenAIWebSearch("gpt-5.5", "Azure")).toBe(false);
    expect(supportsOpenAIWebSearch("claude-3.5", "OpenAI")).toBe(false);
  });
});
