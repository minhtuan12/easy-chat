import "antd/dist/reset.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review Chat",
  description: "Admin-managed account chat built with Next.js and Ant Design",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <header
        style={{
          background: "#1677ff",
          color: "white",
          height: 45,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontWeight: 600,
        }}
      >
        ĐỐI THOẠI DÂN CHỦ TRUNG ĐOÀN 141
      </header>
      <body>{children}</body>
    </html>
  );
}
