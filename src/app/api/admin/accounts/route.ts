import { NextResponse } from "next/server";
import { createAccount, readDb } from "@/lib/db";
import { jsonError, requireAdmin, serializeAccount } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const admin = await requireAdmin();

  if (admin instanceof NextResponse) {
    return admin;
  }

  const db = await readDb();
  return NextResponse.json({ accounts: db.accounts.map(serializeAccount) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();

  if (admin instanceof NextResponse) {
    return admin;
  }

  const body = (await request.json().catch(() => null)) as {
    username?: string;
    displayName?: string;
    password?: string;
  } | null;

  const username = body?.username?.trim();
  const displayName = body?.displayName?.trim();
  const password = body?.password ?? "";

  if (!username || !displayName || !password) {
    return jsonError("Vui lòng điền tên đăng nhập, tên hiển thị và mật khẩu");
  }

  try {
    const account = await createAccount({ username, displayName, password });
    return NextResponse.json({ account: serializeAccount(account) }, { status: 201 });
  } catch (error) {
    return jsonError("Đã có lỗi xảy ra");
  }
}
