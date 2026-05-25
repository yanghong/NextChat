import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  createUserSession,
  loginUser,
  setAuthCookie,
} from "@/app/lib/server/user-repository";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const user = await loginUser(body.email ?? "", body.password ?? "");
    const token = await createUserSession(user.id);
    const response = NextResponse.json({ user });
    setAuthCookie(response, token);
    return response;
  } catch (error: any) {
    const status = error instanceof AuthError ? error.status : 500;
    return NextResponse.json(
      { error: true, msg: error?.message ?? "登录失败" },
      { status },
    );
  }
}
