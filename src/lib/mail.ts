import nodemailer from "nodemailer";
import type { SessionUser } from "./types";

const notifyEmail = process.env.ADMIN_NOTIFY_EMAIL ?? "minhtuanng12@gmail.com";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass
    }
  });
}

export async function notifyAdminOfUserMessage(user: SessionUser, content: string) {
  const transporter = createTransporter();

  if (!transporter) {
    console.warn("Email notification skipped: SMTP_HOST, SMTP_USER, or SMTP_PASS is missing.");
    return;
  }

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to: notifyEmail,
    subject: `${user.displayName} đã gửi bạn 1 tin nhắn mới`,
    text: `${user.displayName} (${user.username}) đã gửi bạn 1 tin nhắn mới:\n\n${content}`,
    html: `
      <p><strong>${escapeHtml(user.displayName)}</strong> (${escapeHtml(user.username)}) đã gửi bạn 1 tin nhắn mới.</p>
      <p>${escapeHtml(content).replaceAll("\n", "<br />")}</p>
    `
  });
}
