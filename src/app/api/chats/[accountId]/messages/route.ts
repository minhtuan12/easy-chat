import { NextResponse } from "next/server";
import { addMessage, getAccountById, listMessages } from "@/lib/db";
import { jsonError, requireUser } from "@/lib/http";
import { notifyAdminOfUserMessage } from "@/lib/mail";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ accountId: string }>;
};

async function canAccessConversation(accountId: string) {
  const user = await requireUser();

  if (user instanceof NextResponse) {
    return { user: null, response: user };
  }

  if (user.role !== "admin" && user.id !== accountId) {
    return { user: null, response: jsonError("Forbidden", 403) };
  }

  return { user, response: null };
}

export async function GET(_request: Request, { params }: Params) {
  const { accountId } = await params;
  const access = await canAccessConversation(accountId);

  if (access.response) {
    return access.response;
  }

  const account = await getAccountById(accountId);

  if (!account) {
    return jsonError("Conversation not found.", 404);
  }

  return NextResponse.json({
    messages: await listMessages(accountId)
  });
}

export async function POST(request: Request, { params }: Params) {
  const { accountId } = await params;
  const access = await canAccessConversation(accountId);

  if (access.response) {
    return access.response;
  }

  if (!access.user) {
    return jsonError("Unauthorized", 401);
  }

  const body = (await request.json().catch(() => null)) as { content?: string } | null;
  const content = body?.content?.trim();

  if (!content) {
    return jsonError("Message cannot be empty.");
  }

  try {
    const message = await addMessage({
      accountId,
      senderRole: access.user.role,
      senderId: access.user.id,
      content
    });

    if (access.user.role === "user") {
      notifyAdminOfUserMessage(access.user, content).catch((error) => {
        console.error("Unable to send admin email notification", error);
      });
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to send message.", 404);
  }
}
