import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/server/user-repository";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: true, msg: "请先登录" }, { status: 401 });
  }

  return NextResponse.json({ user });
}
