import { DalleQuality, DalleStyle, ModelSize } from "@/app/typing";
import {
  getImageModelQualities,
  isGptImageModel,
} from "@/app/utils/model-capabilities";

export interface OpenAIImageGenerationOptions {
  model: string;
  prompt: string;
  size?: ModelSize;
  quality?: DalleQuality;
  style?: DalleStyle;
}

export interface OpenAIImageGenerationPayload {
  model: string;
  prompt: string;
  response_format?: "url" | "b64_json";
  n?: number;
  size: ModelSize;
  quality: DalleQuality;
  style?: DalleStyle;
}

function normalizeImageQuality(model: string, quality?: DalleQuality) {
  const qualities = getImageModelQualities(model);
  if (quality && qualities.includes(quality)) {
    return quality;
  }
  return qualities[0] ?? "standard";
}

export function buildOpenAIImageGenerationPayload(
  options: OpenAIImageGenerationOptions,
): OpenAIImageGenerationPayload {
  const size = options.size ?? "1024x1024";
  const quality = normalizeImageQuality(options.model, options.quality);

  if (isGptImageModel(options.model)) {
    return {
      model: options.model,
      prompt: options.prompt,
      size,
      quality,
    };
  }

  return {
    model: options.model,
    prompt: options.prompt,
    response_format: "b64_json",
    n: 1,
    size,
    quality,
    style: options.style ?? "vivid",
  };
}
