import type { ChatSession } from "../store/chat";

export async function fetchRemoteChatSessions() {
  const response = await fetch("/api/chat/sessions", {
    method: "GET",
  });

  if (response.status === 401) return null;

  const data = (await response.json()) as {
    sessions?: ChatSession[];
    msg?: string;
  };

  if (!response.ok) {
    throw new Error(data.msg || "Failed to load chat sessions");
  }

  return data.sessions ?? [];
}

export async function saveRemoteChatSessions(sessions: ChatSession[]) {
  const response = await fetch("/api/chat/sessions", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessions }),
  });

  if (response.status === 401) return false;

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { msg?: string };
    throw new Error(data.msg || "Failed to save chat sessions");
  }

  return true;
}
