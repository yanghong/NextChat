export type CurrentUser = {
  id: number;
  email: string;
  name: string;
};

type AuthResponse = {
  user?: CurrentUser;
  msg?: string;
};

async function parseAuthResponse(response: Response) {
  const data = (await response.json()) as AuthResponse;

  if (!response.ok || !data.user) {
    throw new Error(data.msg || "Authentication failed");
  }

  return data.user;
}

export async function getCurrentUser() {
  const response = await fetch("/api/auth/me", {
    method: "GET",
  });

  if (response.status === 401) return null;

  return parseAuthResponse(response);
}

export async function login(email: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  return parseAuthResponse(response);
}

export async function register(email: string, password: string, name: string) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, name }),
  });

  return parseAuthResponse(response);
}

export async function logout() {
  await fetch("/api/auth/logout", {
    method: "POST",
  });
}
