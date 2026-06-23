import { jest } from "@jest/globals";
import {
  fetchWithNetworkRetry,
  getReusableRequestBody,
} from "@/app/api/retry";

describe("API fetch retry", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("retries network failures five times before succeeding", async () => {
    const response = { ok: true } as Response;
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce(response);

    await expect(
      fetchWithNetworkRetry("https://example.com", () => ({
        method: "POST",
        body: "payload",
      })),
    ).resolves.toBe(response);

    expect(fetchSpy).toHaveBeenCalledTimes(6);
  });

  test("does not retry non-network failures", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("bad request setup"));

    await expect(
      fetchWithNetworkRetry("https://example.com", () => ({ method: "GET" })),
    ).rejects.toThrow("bad request setup");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("materializes request bodies so retries can reuse them", async () => {
    const body = new ArrayBuffer(7);
    const arrayBuffer = jest.fn(async () => body);
    const req = {
      method: "POST",
      body: true,
      arrayBuffer,
    } as unknown as Request;

    await expect(getReusableRequestBody(req)).resolves.toBe(body);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  test("does not materialize bodies for methods without bodies", async () => {
    const arrayBuffer = jest.fn(async () => new ArrayBuffer(0));
    const req = {
      method: "GET",
      body: true,
      arrayBuffer,
    } as unknown as Request;

    await expect(getReusableRequestBody(req)).resolves.toBeNull();
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
