import { PoolConnection, RowDataPacket } from "mysql2/promise";
import { ensureAuthSchema, getDbPool, withTransaction } from "./db";

export type StoredChatMessage = {
  id: string;
  role: string;
  content: unknown;
  date: string;
  streaming?: boolean;
  isError?: boolean;
  model?: string;
  tools?: unknown;
  audio_url?: string;
  isMcpResponse?: boolean;
};

export type StoredChatSession = {
  id: string;
  topic: string;
  memoryPrompt: string;
  messages: StoredChatMessage[];
  stat: unknown;
  lastUpdate: number;
  lastSummarizeIndex: number;
  clearContextIndex?: number;
  mask: unknown;
};

type SessionRow = RowDataPacket & {
  client_id: string;
  topic: string;
  memory_prompt: string;
  stat_json: string | object;
  mask_json: string | object;
  last_update: number;
  last_summarize_index: number;
  clear_context_index: number | null;
};

type MessageRow = RowDataPacket & {
  session_client_id: string;
  message_id: string;
  role: string;
  content_json: string | unknown;
  meta_json: string | Record<string, unknown>;
  message_date: string;
};

function parseJson<T>(value: string | T): T {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value as T;
  }
}

export async function getChatSessions(userId: number) {
  await ensureAuthSchema();

  const [sessionRows] = await getDbPool().execute<SessionRow[]>(
    `SELECT client_id, topic, memory_prompt, stat_json, mask_json,
            last_update, last_summarize_index, clear_context_index
     FROM chat_sessions
     WHERE user_id = ?
     ORDER BY sort_order ASC, last_update DESC`,
    [userId],
  );

  if (sessionRows.length === 0) return [];

  const [messageRows] = await getDbPool().execute<MessageRow[]>(
    `SELECT session_client_id, message_id, role, content_json, meta_json, message_date
     FROM chat_messages
     WHERE user_id = ?
     ORDER BY session_client_id ASC, sort_order ASC, id ASC`,
    [userId],
  );

  const messagesBySession = new Map<string, StoredChatMessage[]>();
  for (const row of messageRows) {
    const meta = parseJson<Record<string, unknown>>(row.meta_json);
    const message: StoredChatMessage = {
      id: row.message_id,
      role: row.role,
      content: parseJson(row.content_json),
      date: row.message_date,
      ...meta,
    };
    const messages = messagesBySession.get(row.session_client_id) ?? [];
    messages.push(message);
    messagesBySession.set(row.session_client_id, messages);
  }

  return sessionRows.map<StoredChatSession>((row) => ({
    id: row.client_id,
    topic: row.topic,
    memoryPrompt: row.memory_prompt,
    messages: messagesBySession.get(row.client_id) ?? [],
    stat: parseJson(row.stat_json),
    lastUpdate: Number(row.last_update),
    lastSummarizeIndex: Number(row.last_summarize_index),
    clearContextIndex: row.clear_context_index ?? undefined,
    mask: parseJson(row.mask_json),
  }));
}

async function insertMessages(
  connection: PoolConnection,
  userId: number,
  session: StoredChatSession,
) {
  for (const [index, message] of session.messages.entries()) {
    const {
      id,
      role,
      content,
      date,
      streaming,
      isError,
      model,
      tools,
      audio_url,
      isMcpResponse,
    } = message;
    const meta = {
      streaming,
      isError,
      model,
      tools,
      audio_url,
      isMcpResponse,
    };

    await connection.execute(
      `INSERT INTO chat_messages
        (user_id, session_client_id, message_id, role, content_json, meta_json, message_date, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        session.id,
        id,
        role,
        JSON.stringify(content ?? ""),
        JSON.stringify(meta),
        date,
        index,
      ],
    );
  }
}

export async function replaceChatSessions(
  userId: number,
  sessions: StoredChatSession[],
) {
  await ensureAuthSchema();

  await withTransaction(async (connection) => {
    await connection.execute("DELETE FROM chat_messages WHERE user_id = ?", [
      userId,
    ]);
    await connection.execute("DELETE FROM chat_sessions WHERE user_id = ?", [
      userId,
    ]);

    for (const [index, session] of sessions.entries()) {
      await connection.execute(
        `INSERT INTO chat_sessions
          (user_id, client_id, topic, memory_prompt, stat_json, mask_json,
           last_update, last_summarize_index, clear_context_index, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          session.id,
          session.topic,
          session.memoryPrompt ?? "",
          JSON.stringify(session.stat ?? {}),
          JSON.stringify(session.mask ?? {}),
          Number(session.lastUpdate ?? Date.now()),
          Number(session.lastSummarizeIndex ?? 0),
          session.clearContextIndex ?? null,
          index,
        ],
      );

      await insertMessages(connection, userId, session);
    }
  });
}
