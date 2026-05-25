import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { ensureAuthSchema, getDbPool } from "./db";
import {
  AUTH_COOKIE_NAME,
  AuthUser,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  verifyPassword,
} from "./auth";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type UserRow = RowDataPacket & {
  id: number;
  email: string;
  name: string;
  password_hash: string;
};

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function publicUser(row: UserRow): AuthUser {
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
  };
}

export async function registerUser(email: string, password: string, name = "") {
  await ensureAuthSchema();

  const normalizedEmail = normalizeEmail(email);
  const displayName = name.trim() || normalizedEmail.split("@")[0];

  if (!normalizedEmail.includes("@")) {
    throw new AuthError("请输入有效邮箱");
  }

  if (password.length < 8) {
    throw new AuthError("密码至少需要 8 位");
  }

  const passwordHash = await hashPassword(password);

  try {
    const [result] = await getDbPool().execute<ResultSetHeader>(
      "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
      [normalizedEmail, displayName, passwordHash],
    );

    return {
      id: Number(result.insertId),
      email: normalizedEmail,
      name: displayName,
    };
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") {
      throw new AuthError("该邮箱已注册", 409);
    }
    throw error;
  }
}

export async function loginUser(email: string, password: string) {
  await ensureAuthSchema();

  const normalizedEmail = normalizeEmail(email);
  const [rows] = await getDbPool().execute<UserRow[]>(
    "SELECT id, email, name, password_hash FROM users WHERE email = ? LIMIT 1",
    [normalizedEmail],
  );
  const user = rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new AuthError("邮箱或密码错误", 401);
  }

  return publicUser(user);
}

export async function createUserSession(userId: number) {
  await ensureAuthSchema();

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  await getDbPool().execute(
    "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))",
    [userId, tokenHash, SESSION_MAX_AGE_SECONDS],
  );

  return token;
}

export async function getUserBySessionToken(token: string) {
  await ensureAuthSchema();

  const [rows] = await getDbPool().execute<UserRow[]>(
    `SELECT users.id, users.email, users.name, users.password_hash
     FROM auth_sessions
     INNER JOIN users ON users.id = auth_sessions.user_id
     WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > NOW()
     LIMIT 1`,
    [hashSessionToken(token)],
  );
  const user = rows[0];

  return user ? publicUser(user) : null;
}

export async function deleteUserSession(token: string) {
  await ensureAuthSchema();

  await getDbPool().execute("DELETE FROM auth_sessions WHERE token_hash = ?", [
    hashSessionToken(token),
  ]);
}

export async function getCurrentUser() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  return getUserBySessionToken(token);
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("请先登录", 401);
  }
  return user;
}

export function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
