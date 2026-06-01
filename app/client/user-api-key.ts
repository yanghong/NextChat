type UserApiKeyState = {
  hasOpenAIKey: boolean;
  msg?: string;
};

async function parseUserApiKeyResponse(response: Response) {
  const data = (await response.json()) as UserApiKeyState;

  if (!response.ok) {
    throw new Error(data.msg || "API Key request failed");
  }

  return data;
}

export async function getUserApiKeyState() {
  const response = await fetch("/api/user/api-key", {
    method: "GET",
  });

  return parseUserApiKeyResponse(response);
}

export async function saveUserOpenAIKey(apiKey: string) {
  const response = await fetch("/api/user/api-key", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ provider: "openai", apiKey }),
  });

  return parseUserApiKeyResponse(response);
}

export async function deleteUserOpenAIKey() {
  const response = await fetch("/api/user/api-key?provider=openai", {
    method: "DELETE",
  });

  return parseUserApiKeyResponse(response);
}
