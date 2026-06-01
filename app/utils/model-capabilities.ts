import {
  REQUEST_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS_FOR_THINKING,
} from "../constant";
import {
  DalleQuality,
  GptReasoningMode,
  ModelSize,
  WebSearchContextSize,
} from "../typing";

export function isDalle3(model: string) {
  return model === "dall-e-3";
}

export function isGptImageModel(model: string) {
  return model === "gpt-image-2";
}

export function isImageGenerationModel(model: string) {
  return isDalle3(model) || isGptImageModel(model);
}

export function supportsOpenAIReasoningMode(model: string, providerName = "") {
  return (
    providerName.trim().toLowerCase() !== "azure" &&
    model.toLowerCase().startsWith("gpt-5") &&
    !isImageGenerationModel(model)
  );
}

export function supportsOpenAIWebSearch(model: string, providerName = "") {
  return (
    providerName.trim().toLowerCase() !== "azure" &&
    model.toLowerCase().startsWith("gpt-5") &&
    !isImageGenerationModel(model)
  );
}

export function applyOpenAIReasoningMode(
  payload: Record<string, any>,
  config: {
    model: string;
    providerName?: string;
    reasoningMode?: GptReasoningMode;
  },
) {
  if (
    supportsOpenAIReasoningMode(config.model, config.providerName) &&
    config.reasoningMode === "thinking"
  ) {
    payload.reasoning_effort = "high";
  }
}

export type OpenAIWebSearchTool = {
  type: "web_search";
  search_context_size: WebSearchContextSize;
};

export function mergeChatTools(
  hostedTools?: unknown[],
  pluginTools?: unknown[],
) {
  const tools = [...(hostedTools ?? []), ...(pluginTools ?? [])];
  return tools.length > 0 ? tools : undefined;
}

export function applyOpenAIWebSearchTool(
  payload: Record<string, any>,
  config: {
    model: string;
    providerName?: string;
    webSearch?: boolean;
    webSearchContextSize?: WebSearchContextSize;
  },
) {
  if (
    !config.webSearch ||
    !supportsOpenAIWebSearch(config.model, config.providerName)
  ) {
    return;
  }

  const webSearchTool: OpenAIWebSearchTool = {
    type: "web_search",
    search_context_size: config.webSearchContextSize ?? "low",
  };

  payload.tools = mergeChatTools(payload.tools, [webSearchTool]);
  payload.tool_choice = { type: "web_search" };
}

export function getTimeoutMSByModel(model: string) {
  model = model.toLowerCase();
  if (
    isImageGenerationModel(model) ||
    model.startsWith("dall-e") ||
    model.startsWith("dalle") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.includes("deepseek-r") ||
    model.includes("-thinking")
  ) {
    return REQUEST_TIMEOUT_MS_FOR_THINKING;
  }
  return REQUEST_TIMEOUT_MS;
}

export function getModelSizes(model: string): ModelSize[] {
  if (isDalle3(model)) {
    return ["1024x1024", "1792x1024", "1024x1792"];
  }
  if (isGptImageModel(model)) {
    return ["1024x1024"];
  }
  if (model.toLowerCase().includes("cogview")) {
    return [
      "1024x1024",
      "768x1344",
      "864x1152",
      "1344x768",
      "1152x864",
      "1440x720",
      "720x1440",
    ];
  }
  return [];
}

export function supportsCustomSize(model: string): boolean {
  return getModelSizes(model).length > 0;
}

export function getImageModelQualities(model: string): DalleQuality[] {
  if (isGptImageModel(model)) {
    return ["low"];
  }
  if (isDalle3(model)) {
    return ["standard", "hd"];
  }
  return [];
}
