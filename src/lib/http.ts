import { NextResponse } from "next/server";
import type { SessionUser } from "./types";
import { getCurrentUser } from "./auth";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getCurrentUser();

  if (!user) {
    return jsonError("Unauthorized", 401);
  }

  return user;
}

export async function requireAdmin(): Promise<SessionUser | NextResponse> {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  if (user.role !== "admin") {
    return jsonError("Admin access required", 403);
  }

  return user;
}

export function serializeAccount<T extends { passwordHash?: string; salt?: string }>(account: T) {
  const { passwordHash: _passwordHash, salt: _salt, ...safeAccount } = account;
  return safeAccount;
}
