import type { NextApiRequest } from "next";
import type { Server as HttpServer } from "http";
import type { Socket as NetSocket } from "net";
import type { NextApiResponse } from "next";
import type { Server as IOServer, Socket } from "socket.io";
import { Server } from "socket.io";
import { addMessage, getAccountById, getAdminUser, listConversations, listMessages } from "@/lib/db";
import { cookieName, parseSessionToken } from "@/lib/auth";
import type { Message, SessionUser } from "@/lib/types";
import { notifyAdminOfUserMessage } from "@/lib/mail";

type SocketServer = HttpServer & {
  io?: IOServer<ClientToServerEvents, ServerToClientEvents>;
  presence?: PresenceState;
};

type SocketWithServer = NetSocket & {
  server: SocketServer;
};

type ResponseWithSocket = NextApiResponse & {
  socket: SocketWithServer;
};

type SocketAck<T> = (response: { ok: true; data: T } | { ok: false; error: string }) => void;

type ServerToClientEvents = {
  "chats:update": (conversations: Awaited<ReturnType<typeof listConversations>>) => void;
  "messages:new": (message: Message) => void;
};

type ClientToServerEvents = {
  "chats:list": (ack: SocketAck<Awaited<ReturnType<typeof listConversations>>>) => void;
  "messages:join": (accountId: string, ack: SocketAck<Message[]>) => void;
  "messages:send": (payload: { accountId: string; content: string }, ack: SocketAck<Message>) => void;
};

type AuthedSocket = Socket<ClientToServerEvents, ServerToClientEvents> & {
  user?: SessionUser;
};

type PresenceState = {
  adminSockets: Set<string>;
  accountSockets: Map<string, Set<string>>;
};

function createPresence(): PresenceState {
  return {
    adminSockets: new Set<string>(),
    accountSockets: new Map<string, Set<string>>()
  };
}

function parseCookie(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

async function authenticateSocket(socket: AuthedSocket, next: (error?: Error) => void) {
  const token = parseCookie(socket.handshake.headers.cookie)[cookieName];
  const sessionUser = token ? parseSessionToken(token) : null;

  if (!sessionUser) {
    next(new Error("Unauthorized"));
    return;
  }

  if (sessionUser.role === "admin") {
    socket.user = getAdminUser();
    next();
    return;
  }

  const account = await getAccountById(sessionUser.id);

  if (!account) {
    next(new Error("Unauthorized"));
    return;
  }

  socket.user = {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: "user"
  };
  next();
}

function canAccess(user: SessionUser, accountId: string) {
  return user.role === "admin" || user.id === accountId;
}

async function emitConversationUpdates(io: IOServer<ClientToServerEvents, ServerToClientEvents>, accountId: string) {
  const [adminConversations, userConversations] = await Promise.all([
    listConversations({ id: "admin", role: "admin" }),
    listConversations({ id: accountId, role: "user" })
  ]);

  io.to("admins").emit("chats:update", withPresence(adminConversations, { id: "admin", role: "admin" }, io));
  io.to(`user:${accountId}`).emit(
    "chats:update",
    withPresence(userConversations, { id: accountId, role: "user" }, io)
  );
}

async function emitAllConversationUpdates(io: IOServer<ClientToServerEvents, ServerToClientEvents>) {
  const adminConversations = await listConversations({ id: "admin", role: "admin" });
  io.to("admins").emit("chats:update", withPresence(adminConversations, { id: "admin", role: "admin" }, io));

  await Promise.all(
    adminConversations.map(async (conversation) => {
      const user = { id: conversation.account.id, role: "user" as const };
      const userConversations = await listConversations(user);
      io.to(`user:${conversation.account.id}`).emit("chats:update", withPresence(userConversations, user, io));
    })
  );
}

function isAdminOnline(io: IOServer<ClientToServerEvents, ServerToClientEvents>) {
  return (io.httpServer as SocketServer).presence?.adminSockets.size ? true : false;
}

function isAccountOnline(io: IOServer<ClientToServerEvents, ServerToClientEvents>, accountId: string) {
  return Boolean((io.httpServer as SocketServer).presence?.accountSockets.get(accountId)?.size);
}

function withPresence(
  conversations: Awaited<ReturnType<typeof listConversations>>,
  user: Pick<SessionUser, "id" | "role">,
  io: IOServer<ClientToServerEvents, ServerToClientEvents>
) {
  return conversations.map((conversation) => ({
    ...conversation,
    isOnline: user.role === "admin" ? isAccountOnline(io, conversation.account.id) : isAdminOnline(io)
  }));
}

function registerHandlers(io: IOServer<ClientToServerEvents, ServerToClientEvents>, socket: AuthedSocket) {
  const user = socket.user;

  if (!user) {
    socket.disconnect(true);
    return;
  }

  if (user.role === "admin") {
    socket.join("admins");
    (io.httpServer as SocketServer).presence?.adminSockets.add(socket.id);
  } else {
    socket.join(`user:${user.id}`);
    socket.join(`conversation:${user.id}`);
    const presence = (io.httpServer as SocketServer).presence;
    const sockets = presence?.accountSockets.get(user.id) ?? new Set<string>();
    sockets.add(socket.id);
    presence?.accountSockets.set(user.id, sockets);
  }

  emitAllConversationUpdates(io).catch(() => undefined);

  socket.on("disconnect", () => {
    const presence = (io.httpServer as SocketServer).presence;

    if (user.role === "admin") {
      presence?.adminSockets.delete(socket.id);
    } else {
      const sockets = presence?.accountSockets.get(user.id);
      sockets?.delete(socket.id);

      if (sockets?.size === 0) {
        presence?.accountSockets.delete(user.id);
      }
    }

    emitAllConversationUpdates(io).catch(() => undefined);
  });

  socket.on("chats:list", async (ack) => {
    try {
      ack({ ok: true, data: withPresence(await listConversations(user), user, io) });
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : "Unable to load chats." });
    }
  });

  socket.on("messages:join", async (accountId, ack) => {
    try {
      if (!canAccess(user, accountId)) {
        ack({ ok: false, error: "Forbidden" });
        return;
      }

      socket.join(`conversation:${accountId}`);
      ack({ ok: true, data: await listMessages(accountId) });
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : "Unable to load messages." });
    }
  });

  socket.on("messages:send", async (payload, ack) => {
    const accountId = payload.accountId;
    const content = payload.content?.trim();

    try {
      if (!accountId || !content) {
        ack({ ok: false, error: "Message cannot be empty." });
        return;
      }

      if (!canAccess(user, accountId)) {
        ack({ ok: false, error: "Forbidden" });
        return;
      }

      const message = await addMessage({
        accountId,
        senderRole: user.role,
        senderId: user.id,
        content
      });

      ack({ ok: true, data: message });
      io.to(`conversation:${accountId}`).emit("messages:new", message);
      await emitConversationUpdates(io, accountId);

      if (user.role === "user") {
        notifyAdminOfUserMessage(user, content).catch((error) => {
          console.error("Unable to send admin email notification", error);
        });
      }
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : "Unable to send message." });
    }
  });
}

export default function handler(_req: NextApiRequest, res: ResponseWithSocket) {
  if (!res.socket.server.io) {
    const io = new Server<ClientToServerEvents, ServerToClientEvents>(res.socket.server, {
      path: "/api/socket/io",
      addTrailingSlash: false
    });

    res.socket.server.presence = createPresence();

    io.use((socket, next) => {
      authenticateSocket(socket as AuthedSocket, next).catch((error) => next(error));
    });

    io.on("connection", (socket) => registerHandlers(io, socket as AuthedSocket));
    res.socket.server.io = io;
  }

  res.status(200).json({ ok: true });
}

export const config = {
  api: {
    bodyParser: false
  }
};
