import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "StreamSight",
  description: "捐款項目列表 — 公益團體 / 捐款專案 / 義賣商品",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: 瀏覽器擴充功能 / Chrome 自動翻譯常會在 React
    // hydrate 前改 <html lang>，造成「server: zh-Hant / client: en」假警告。
    // 此屬性僅壓制 <html> 一層的不匹配，不會掩蓋子節點真實 hydration bug。
    // 參考：Next 16 docs 01-app/02-guides/preventing-flash-before-hydration.md
    <html lang="zh-Hant" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-dvh flex flex-col bg-surface-page">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
