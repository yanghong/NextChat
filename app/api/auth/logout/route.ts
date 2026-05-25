import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
} from "@/app/lib/server/auth";
import {
  clearAuthCookie,
  deleteUserSession,
} from "@/app/lib/server/user-repository";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (token) {
    await deleteUserSession(token);
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookie(response);
  return response;
}
