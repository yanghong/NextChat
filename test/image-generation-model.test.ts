import {
  getImageModelQualities,
  getModelSizes,
  getTimeoutMSByModel,
  isDalle3,
  isImageGenerationModel,
  supportsCustomSize,
} from "../app/utils/model-capabilities";
import { REQUEST_TIMEOUT_MS_FOR_THINKING } from "../app/constant";
import { buildOpenAIImageGenerationPayload } from "../app/client/platforms/openai-image";

describe("image generation model helpers", () => {
  test("recognizes gpt-image-2 as an image generation model", () => {
    expect(isImageGenerationModel("gpt-image-2")).toBe(true);
    expect(isDalle3("gpt-image-2")).toBe(false);
  });

  test("keeps dall-e-3 as an image generation model", () => {
    expect(isImageGenerationModel("dall-e-3")).toBe(true);
    expect(isDalle3("dall-e-3")).toBe(true);
  });

  test("exposes the supported size for gpt-image-2", () => {
    expect(getModelSizes("gpt-image-2")).toEqual(["1024x1024"]);
    expect(supportsCustomSize("gpt-image-2")).toBe(true);
  });

  test("uses low quality for gpt-image-2", () => {
    expect(getImageModelQualities("gpt-image-2")).toEqual(["low"]);
    expect(getImageModelQualities("dall-e-3")).toEqual(["standard", "hd"]);
  });

  test("uses the long request timeout for gpt-image-2", () => {
    expect(getTimeoutMSByModel("gpt-image-2")).toBe(
      REQUEST_TIMEOUT_MS_FOR_THINKING,
    );
  });

  test("builds the OpenAI-compatible gpt-image-2 request body", () => {
    expect(
      buildOpenAIImageGenerationPayload({
        model: "gpt-image-2",
        prompt: "Generate a blue icon",
        size: "1024x1024",
        quality: "standard",
      }),
    ).toEqual({
      model: "gpt-image-2",
      prompt: "Generate a blue icon",
      size: "1024x1024",
      quality: "low",
    });
  });

  test("keeps dall-e-3 request body compatible with the existing API", () => {
    expect(
      buildOpenAIImageGenerationPayload({
        model: "dall-e-3",
        prompt: "Generate a blue icon",
        size: "1024x1024",
        quality: "hd",
        style: "natural",
      }),
    ).toEqual({
      model: "dall-e-3",
      prompt: "Generate a blue icon",
      response_format: "b64_json",
      n: 1,
      size: "1024x1024",
      quality: "hd",
      style: "natural",
    });
  });
});
