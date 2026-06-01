import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  requireCurrentUser,
} from "@/app/lib/server/user-repository";
import {
  deleteUserApiKey,
  hasUserApiKey,
  OPENAI_USER_API_KEY_PROVIDER,
  upsertUserApiKey,
} from "@/app/lib/server/user-api-key-repository";

export const runtime = "nodejs";

function providerFrom(value: unknown) {
  return value === OPENAI_USER_API_KEY_PROVIDER
    ? OPENAI_USER_API_KEY_PROVIDER
    : null;
}

function apiKeyError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: true, msg: error.message },
      { status: error.status },
    );
  }

  console.error("[User API Key]", error);
  return NextResponse.json(
    { error: true, msg: "API Key 服务暂不可用" },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const hasOpenAIKey = await hasUserApiKey(
      user.id,
      OPENAI_USER_API_KEY_PROVIDER,
    );

    return NextResponse.json({ hasOpenAIKey });
  } catch (error) {
    return apiKeyError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const body = (await req.json()) as { provider?: string; apiKey?: string };
    const provider = providerFrom(body.provider);

    if (!provider || !body.apiKey?.trim()) {
      return NextResponse.json(
        { error: true, msg: "请输入有效 API Key" },
        { status: 400 },
      );
    }

    await upsertUserApiKey(user.id, provider, body.apiKey);
    return NextResponse.json({ hasOpenAIKey: true });
  } catch (error) {
    return apiKeyError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const provider =
      providerFrom(req.nextUrl.searchParams.get("provider")) ??
      OPENAI_USER_API_KEY_PROVIDER;

    await deleteUserApiKey(user.id, provider);
    return NextResponse.json({ hasOpenAIKey: false });
  } catch (error) {
    return apiKeyError(error);
  }
}
