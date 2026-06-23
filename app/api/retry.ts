export const NETWORK_RETRY_COUNT = 5;

const METHODS_WITHOUT_BODY = new Set(["get", "head"]);

const NETWORK_ERROR_PATTERNS = [
  "network error",
  "fetch failed",
  "failed to fetch",
  "socket",
  "econnreset",
  "etimedout",
  "econnrefused",
  "terminated",
];

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isNetworkFetchError(error: unknown) {
  if (isAbortError(error)) return false;

  const message = error instanceof Error ? error.message : String(error ?? "");

  return NETWORK_ERROR_PATTERNS.some((pattern) =>
    message.toLowerCase().includes(pattern),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getReusableRequestBody(
  req: Request,
  method = req.method,
) {
  if (METHODS_WITHOUT_BODY.has(method.toLowerCase()) || !req.body) {
    return null;
  }

  return await req.arrayBuffer();
}

export async function fetchWithNetworkRetry(
  url: string,
  optionsFactory: () => RequestInit,
  retryCount = NETWORK_RETRY_COUNT,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await fetch(url, optionsFactory());
    } catch (error) {
      lastError = error;

      if (attempt >= retryCount || !isNetworkFetchError(error)) {
        throw error;
      }

      console.warn(
        `[Fetch Retry] network request failed, retrying ${
          attempt + 1
        }/${retryCount}`,
        error,
      );
      await sleep(Math.min(1000, 100 * 2 ** attempt));
    }
  }

  throw lastError;
}
