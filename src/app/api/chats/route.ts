import { NextResponse } from "next/server";
import { listConversations } from "@/lib/db";
import { requireUser } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return user;
  }

  const conversations = await listConversations(user);
  return NextResponse.json({ conversations });
}
