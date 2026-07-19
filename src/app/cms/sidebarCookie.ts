// Spec 019 §4 / §I-3 — sidebar_width cookie 純函式層（跨 repo 契約 §3.1）。
//
// 皆為純函式、以 document.cookie 字串為參數；與 Streamlit 端注入 JS 共用同一條
// regex 與值域語義（StreamSightStreamlit/docs/specs/sidebar-width-sync.md）。
// ⚠ 不可 import 'server-only'——client hook 要用（019 §I-2 前例：014a §I-2）。

// 值域取自 Streamlit 側欄實測（同 useSidebarPanel 2026-07-19），亦為契約 §3.1 的
// cookie 值域。定義於此（而非 useSidebarPanel）以避免兩模組循環 import。
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 600

export const SIDEBAR_COOKIE = 'sidebar_width'
export const SIDEBAR_COOKIE_MAX_AGE = 31_536_000 // 1 年（對齊 theme cookie）

// 錨定行尾 / 分號 → "320.5" 不部分匹配（§I-3，與 Streamlit 端 JS 同一條）。
const SIDEBAR_COOKIE_RE = /(?:^|;\s*)sidebar_width=(\d+)(?:;|$)/

/** 抽出 sidebar_width 原始值（供 useSyncExternalStore 快照）；缺 key / 非整數 → null。 */
export function extractSidebarWidthRaw(cookieHeader: string): string | null {
  return SIDEBAR_COOKIE_RE.exec(cookieHeader)?.[1] ?? null
}

/** 單一 cookie 值 → 合法寬度（ASCII 整數且在值域內；其餘 → null，不 clamp）。
 *  供 server 端 `cookies().get(...)?.value`（019 §3.5 SSR 直出）與 client 解析共用。 */
export function parseSidebarWidthValue(
  raw: string | null | undefined,
): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null
  const width = Number.parseInt(raw, 10)
  return width >= SIDEBAR_MIN_WIDTH && width <= SIDEBAR_MAX_WIDTH ? width : null
}

/** 解析為整數寬度；值域外（<200 / >600）→ null（不 clamp，交由讀取退路鏈）。 */
export function parseSidebarWidthCookie(cookieHeader: string): number | null {
  return parseSidebarWidthValue(extractSidebarWidthRaw(cookieHeader))
}

/** 組裝 cookie 字串（對齊 buildThemeCookieString 形狀）。 */
export function buildSidebarWidthCookieString(
  width: number,
  isProd: boolean,
): string {
  const secure = isProd ? '; Secure' : ''
  return `${SIDEBAR_COOKIE}=${width}; Max-Age=${SIDEBAR_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`
}
