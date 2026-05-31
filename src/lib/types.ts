export type Role = "admin" | "user";

export type Account = {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
};

export type Message = {
  id: string;
  accountId: string;
  senderRole: Role;
  senderId: string;
  content: string;
  createdAt: string;
};

export type Database = {
  accounts: Account[];
  messages: Message[];
};

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
};

export type ConversationSummary = {
  account: Omit<Account, "passwordHash" | "salt">;
  lastMessage: Message | null;
  unreadCount: number;
  isOnline?: boolean;
};
