import "antd/dist/reset.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review Chat",
  description: "Admin-managed account chat built with Next.js and Ant Design"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
