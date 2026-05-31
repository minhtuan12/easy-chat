import { NextResponse } from "next/server";
import { getAccountByUsername, getAdminUser, verifyAdminCredentials } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { verifyPassword } from "@/lib/password";
import { setSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
  const username = body?.username?.trim();
  const password = body?.password ?? "";

  if (!username || !password) {
    return jsonError("Tên đăng nhập và mật khẩu là bắt buộc.");
  }

  if (verifyAdminCredentials(username, password)) {
    const admin = getAdminUser();
    await setSession(admin);
    return NextResponse.json({ user: admin });
  }

  const account = await getAccountByUsername(username);

  if (!account || !verifyPassword(password, account.salt, account.passwordHash)) {
    return jsonError("Sai tên đăng nhập hoặc mật khẩu", 401);
  }

  const user = {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: "user" as const
  };

  await setSession(user);
  return NextResponse.json({ user });
}
