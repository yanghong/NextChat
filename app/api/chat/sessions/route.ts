import { NextRequest, NextResponse } from "next/server";
import {
  getChatSessions,
  replaceChatSessions,
} from "@/app/lib/server/chat-repository";
import {
  AuthError,
  requireCurrentUser,
} from "@/app/lib/server/user-repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const sessions = await getChatSessions(user.id);
    return NextResponse.json({ sessions });
  } catch (error: any) {
    const status = error instanceof AuthError ? error.status : 500;
    return NextResponse.json(
      { error: true, msg: error?.message ?? "读取会话失败" },
      { status },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = await req.json();
    const sessions = Array.isArray(body.sessions) ? body.sessions : [];
    await replaceChatSessions(user.id, sessions);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const status = error instanceof AuthError ? error.status : 500;
    return NextResponse.json(
      { error: true, msg: error?.message ?? "保存会话失败" },
      { status },
    );
  }
}
