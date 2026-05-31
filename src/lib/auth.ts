import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import type { SessionUser } from "./types";
import { getAdminUser, readDb } from "./db";

export const cookieName = "review_chat_session";
const maxAgeSeconds = 60 * 60 * 24 * 7;

function secret() {
  return process.env.SESSION_SECRET ?? "local-review-chat-secret";
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function parseSessionToken(token: string): SessionUser | null {
  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload);
  const given = Buffer.from(signature);
  const target = Buffer.from(expected);

  if (given.length !== target.length || !timingSafeEqual(given, target)) {
    return null;
  }

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser & { exp: number };

  if (!parsed.exp || parsed.exp < Date.now()) {
    return null;
  }

  return {
    id: parsed.id,
    username: parsed.username,
    displayName: parsed.displayName,
    role: parsed.role
  };
}

export function createSessionToken(user: SessionUser) {
  const payload = base64Url(JSON.stringify({ ...user, exp: Date.now() + maxAgeSeconds * 1000 }));
  return `${payload}.${sign(payload)}`;
}

export async function setSession(user: SessionUser) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    return null;
  }

  const user = parseSessionToken(token);

  if (!user) {
    return null;
  }

  if (user.role === "admin") {
    return getAdminUser();
  }

  const db = await readDb();
  const account = db.accounts.find((item) => item.id === user.id);

  if (!account) {
    return null;
  }

  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: "user"
  };
}

export function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(cookieName)?.value;
  return token ? parseSessionToken(token) : null;
}
