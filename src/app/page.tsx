"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App, Avatar, Button, ConfigProvider, Form, Input, Modal, Spin, Typography } from "antd";
import { LogOut, MessageCircle, Plus, Send, ShieldCheck, UserRound } from "lucide-react";
import { io, type Socket } from "socket.io-client";
import type { ConversationSummary, Message, SessionUser } from "@/lib/types";

type LoginValues = {
  username: string;
  password: string;
};

type AccountValues = {
  username: string;
  displayName: string;
  password: string;
};

type Ack<T> = { ok: true; data: T } | { ok: false; error: string };

const timeFormatter = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit"
});

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload as T;
}

function LoginView({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: LoginValues) => {
    setLoading(true);

    try {
      const result = await requestJson<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(values)
      });
      onLogin(result.user);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Unable to login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-header">
          <Avatar size={44} icon={<MessageCircle size={22} />} style={{ background: "#1677ff", marginBottom: 14 }} />
          <h1 className="login-title">Chat</h1>
        </div>
        <Form<LoginValues> layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: "Nhập tên đăng nhập." }]}>
            <Input size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: "Nhập mật khẩu." }]}>
            <Input.Password size="large" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            Đăng nhập
          </Button>
        </Form>
      </section>
    </main>
  );
}

function AccountModal({
  open,
  onCancel,
  onCreated
}: {
  open: boolean;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<AccountValues>();
  const [loading, setLoading] = useState(false);

  const handleCreate = async (values: AccountValues) => {
    setLoading(true);

    try {
      await requestJson("/api/admin/accounts", {
        method: "POST",
        body: JSON.stringify(values)
      });
      message.success("Tạo tài khoản thành công");
      form.resetFields();
      onCreated();
    } catch (error) {
      message.error("Đã có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Tạo tài khoản" open={open} onCancel={onCancel} footer={null} destroyOnClose>
      <Form<AccountValues> form={form} layout="vertical" onFinish={handleCreate} requiredMark={false}>
        <Form.Item name="displayName" label="Tên hiển thị" rules={[{ required: true, message: "Nhập tên hiển thị" }]}>
          <Input autoComplete="name" />
        </Form.Item>
        <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: "Nhập tên đăng nhập" }]}>
          <Input autoComplete="username" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Mật khẩu"
          rules={[{ required: true, message: "Nhập mật khẩu" }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} block>
          Tạo tài khoản
        </Button>
      </Form>
    </Modal>
  );
}

function ChatApp({ initialUser }: { initialUser: SessionUser }) {
  const { message } = App.useApp();
  const [user, setUser] = useState(initialUser);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(initialUser.role === "user" ? initialUser.id : null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const selectedAccountIdRef = useRef(selectedAccountId);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.account.id === selectedAccountId) ?? null,
    [conversations, selectedAccountId]
  );
  const chatDisplayName = user.role === "admin" ? selectedConversation?.account.displayName : "Admin";
  const chatOnline = Boolean(selectedConversation?.isOnline);

  const applyConversations = useCallback((nextConversations: ConversationSummary[]) => {
    setConversations(nextConversations);
    setSelectedAccountId((current) => current ?? nextConversations[0]?.account.id ?? null);
  }, []);

  useEffect(() => {
    selectedAccountIdRef.current = selectedAccountId;
  }, [selectedAccountId]);

  useEffect(() => {
    let activeSocket: Socket | null = null;
    let cancelled = false;

    fetch("/api/socket")
      .then(() => {
        if (cancelled) {
          return;
        }

        activeSocket = io({
          path: "/api/socket/io",
          addTrailingSlash: false
        });

        activeSocket.on("connect", () => {
          activeSocket?.emit("chats:list", (response: Ack<ConversationSummary[]>) => {
            if (response.ok) {
              applyConversations(response.data);
            } else {
              message.error(response.error);
            }

            setLoading(false);
          });
        });

        activeSocket.on("connect_error", (error) => {
          setLoading(false);
          message.error(error.message || "Unable to connect to chat.");
        });

        activeSocket.on("chats:update", applyConversations);

        activeSocket.on("messages:new", (nextMessage: Message) => {
          if (nextMessage.accountId !== selectedAccountIdRef.current) {
            return;
          }

          setMessages((current) =>
            current.some((item) => item.id === nextMessage.id) ? current : [...current, nextMessage]
          );
        });

        setSocket(activeSocket);
      })
      .catch((error) => {
        setLoading(false);
        message.error("Đã có lỗi xảy ra khi kết nối đến chat");
      });

    return () => {
      cancelled = true;
      activeSocket?.disconnect();
      setSocket(null);
    };
  }, [applyConversations, message]);

  useEffect(() => {
    if (!socket || !selectedAccountId) {
      setMessages([]);
      return;
    }

    socket.emit("messages:join", selectedAccountId, (response: Ack<Message[]>) => {
      if (response.ok) {
        setMessages(response.data);
      } else {
        message.error(response.error);
      }
    });
  }, [message, selectedAccountId, socket]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const content = draft.trim();

    if (!socket || !selectedAccountId || !content) {
      return;
    }

    setSending(true);

    try {
      await new Promise<void>((resolve, reject) => {
        socket.emit("messages:send", { accountId: selectedAccountId, content }, (response: Ack<Message>) => {
          if (response.ok) {
            resolve();
          } else {
            reject(new Error(response.error));
          }
        });
      });
      setDraft("");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleLogout = async () => {
    await requestJson("/api/auth/logout", { method: "POST" });
    setUser({ id: "", username: "", displayName: "", role: "user" });
    window.location.reload();
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-row">
            <div>
              <h1 className="brand-title">Chat</h1>
              <p className="brand-subtitle">
                {user.role === "admin" ? "Admin" : `${user.displayName}`}
              </p>
            </div>
            <Button aria-label="Logout" icon={<LogOut size={17} />} onClick={handleLogout} />
          </div>
          {user.role === "admin" ? (
            <Button
              type="primary"
              onClick={() => setAccountModalOpen(true)}
              style={{ marginTop: 16 }}
              block
            >
              <Plus size={17} />
              Thêm tài khoản
            </Button>
          ) : null}
        </div>

        <div className="account-list">
          {loading ? (
            <div className="empty-state">
              <Spin />
            </div>
          ) : conversations.length === 0 ? (
            <div className="empty-state">No conversations yet.</div>
          ) : (
            conversations.map((conversation) => (
              <button
                className={`account-item ${selectedAccountId === conversation.account.id ? "active" : ""}`}
                key={conversation.account.id}
                onClick={() => setSelectedAccountId(conversation.account.id)}
              >
                <Avatar icon={<UserRound size={18} />} style={{ background: "#dce9ff", color: "#0f5fcf" }} />
                <span className="account-meta">
                  <span className="account-name">{user.role === "admin" ? conversation.account.displayName : "Admin"}</span>
                  <span className="account-last">
                    {conversation.lastMessage?.content ?? (user.role === "admin" ? conversation.account.username : "Chat with admin")}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="chat-pane">
        {selectedConversation ? (
          <>
            <header className="chat-header">
              <div className="user-row">
                <Avatar size={42} icon={<UserRound size={20} />} style={{ background: "#1677ff" }} />
                <div>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    {chatDisplayName}
                  </Typography.Title>
                  <span className={`presence ${chatOnline ? "online" : "offline"}`}>
                    {chatOnline ? "Đang hoạt động" : "Offline"}
                  </span>
                </div>
              </div>
              {user.role === "admin" ? <ShieldCheck size={22} color="#1677ff" /> : <MessageCircle size={22} color="#1677ff" />}
            </header>

            <div className="messages">
              <div className="message-stack">
                {messages.length === 0 ? (
                  <div className="empty-state">Start the conversation.</div>
                ) : (
                  messages.map((item) => {
                    const mine = item.senderRole === user.role;
                    return (
                      <div className={`message-row ${mine ? "mine" : ""}`} key={item.id}>
                        <div className="bubble">
                          <p className="bubble-text">{item.content}</p>
                          <span className="bubble-time">{timeFormatter.format(new Date(item.createdAt))}</span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messageEndRef} />
              </div>
            </div>

            <div className="composer">
              <Input
                className="composer-input"
                size="large"
                value={draft}
                placeholder="Aa"
                onChange={(event) => setDraft(event.target.value)}
                onPressEnter={handleSend}
              />
              <Button
                aria-label="Send message"
                type="primary"
                size="large"
                loading={sending}
                onClick={handleSend}
              >
                <Send size={18} />
              </Button>
            </div>
          </>
        ) : (
          <div className="empty-state">Create an account to open the first chat.</div>
        )}
      </section>

      <AccountModal
        open={accountModalOpen}
        onCancel={() => setAccountModalOpen(false)}
        onCreated={() => {
          setAccountModalOpen(false);
          socket?.emit("chats:list", (response: Ack<ConversationSummary[]>) => {
            if (response.ok) {
              applyConversations(response.data);
            } else {
              message.error(response.error);
            }
          });
        }}
      />
    </main>
  );
}

function AppContent() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    requestJson<{ user: SessionUser | null }>("/api/auth/me")
      .then((result) => setUser(result.user))
      .finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) {
    return (
      <main className="login-screen">
        <Spin size="large" />
      </main>
    );
  }

  return user ? <ChatApp initialUser={user} /> : <LoginView onLogin={setUser} />;
}

export default function Home() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1677ff",
          borderRadius: 8,
          fontFamily: "Arial, Helvetica, sans-serif"
        }
      }}
    >
      <App>
        <AppContent />
      </App>
    </ConfigProvider>
  );
}
