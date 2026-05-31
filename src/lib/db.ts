import { randomUUID } from "crypto";
import { MongoServerError } from "mongodb";
import type { Account, ConversationSummary, Database, Message } from "./types";
import { createPasswordHash } from "./password";
import { getMongoDb } from "./mongodb";

const adminCredentials = {
  username: process.env.ADMIN_USERNAME ?? "admin",
  password: process.env.ADMIN_PASSWORD ?? "admin123",
  displayName: process.env.ADMIN_DISPLAY_NAME ?? "Admin"
};

let indexesReady: Promise<void> | null = null;

async function collections() {
  const db = await getMongoDb();
  const accounts = db.collection<Account>("accounts");
  const messages = db.collection<Message>("messages");

  if (!indexesReady) {
    indexesReady = Promise.all([
      accounts.createIndex(
        { username: 1 },
        {
          unique: true,
          collation: { locale: "en", strength: 2 }
        }
      ),
      messages.createIndex({ accountId: 1, createdAt: 1 })
    ]).then(() => undefined);
  }

  await indexesReady;
  return { accounts, messages };
}

export async function readDb(): Promise<Database> {
  const { accounts, messages } = await collections();
  const [accountList, messageList] = await Promise.all([
    accounts.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray(),
    messages.find({}, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray()
  ]);

  return {
    accounts: accountList,
    messages: messageList
  };
}

export async function getAccountByUsername(username: string) {
  const { accounts } = await collections();
  return accounts.findOne({ username }, { projection: { _id: 0 }, collation: { locale: "en", strength: 2 } });
}

export async function getAccountById(accountId: string) {
  const { accounts } = await collections();
  return accounts.findOne({ id: accountId }, { projection: { _id: 0 } });
}

export function getAdminUser() {
  return {
    id: "admin",
    username: adminCredentials.username,
    displayName: adminCredentials.displayName,
    role: "admin" as const
  };
}

export function verifyAdminCredentials(username: string, password: string) {
  return username === adminCredentials.username && password === adminCredentials.password;
}

export async function createAccount(input: { username: string; displayName: string; password: string }) {
  if (input.username.toLowerCase() === adminCredentials.username.toLowerCase()) {
    throw new Error("Username is already in use.");
  }

  const { accounts } = await collections();
  const { passwordHash, salt } = createPasswordHash(input.password);
  const account: Account = {
    id: randomUUID(),
    username: input.username,
    displayName: input.displayName,
    passwordHash,
    salt,
    createdAt: new Date().toISOString()
  };

  try {
    await accounts.insertOne(account);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new Error("Username is already in use.");
    }

    throw error;
  }

  return account;
}

export async function listConversations(user: { id: string; role: "admin" | "user" }) {
  const db = await readDb();
  const accounts = user.role === "admin" ? db.accounts : db.accounts.filter((account) => account.id === user.id);
  const conversations: ConversationSummary[] = accounts.map((account) => {
    const accountMessages = db.messages.filter((message) => message.accountId === account.id);
    const lastMessage = accountMessages.at(-1) ?? null;
    const { passwordHash: _passwordHash, salt: _salt, ...safeAccount } = account;

    return {
      account: safeAccount,
      lastMessage,
      unreadCount: user.role === "admin" ? accountMessages.filter((message) => message.senderRole === "user").length : 0
    };
  });

  conversations.sort((left, right) => {
    const leftDate = left.lastMessage?.createdAt ?? left.account.createdAt;
    const rightDate = right.lastMessage?.createdAt ?? right.account.createdAt;
    return Date.parse(rightDate) - Date.parse(leftDate);
  });

  return conversations;
}

export async function listMessages(accountId: string) {
  const { messages } = await collections();
  return messages.find({ accountId }, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray();
}

export async function addMessage(input: Omit<Message, "id" | "createdAt">) {
  const { accounts, messages } = await collections();
  const account = await accounts.findOne({ id: input.accountId });

  if (!account) {
    throw new Error("Conversation not found.");
  }

  const message: Message = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString()
  };

  await messages.insertOne(message);
  return message;
}
