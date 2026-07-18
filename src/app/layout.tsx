import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { readThemeCookie } from "@/lib/theme/readThemeCookie";

export const metadata: Metadata = {
  title: "StreamSight",
  description: "捐款項目列表 — 公益團體 / 捐款專案 / 義賣商品",
};

// spec 014a §3.3 / §I-7 — async: readThemeCookie() 使此 layout 轉動態渲染，屬預期行為
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // SSR 直出正確 data-theme，首屏無閃爍，不需 inline script（spec 014a §3.3）
  const theme = await readThemeCookie();

  return (
    // suppressHydrationWarning: 瀏覽器擴充功能 / Chrome 自動翻譯常會在 React
    // hydrate 前改 <html lang>，造成「server: zh-Hant / client: en」假警告。
    // 此屬性僅壓制 <html> 一層的不匹配，不會掩蓋子節點真實 hydration bug。
    // 參考：Next 16 docs 01-app/02-guides/preventing-flash-before-hydration.md
    <html lang="zh-Hant" className="h-full antialiased" suppressHydrationWarning data-theme={theme}>
      <body className="min-h-dvh flex flex-col bg-surface-page">
        <Providers initialTheme={theme}>{children}</Providers>
      </body>
    </html>
  );
}
