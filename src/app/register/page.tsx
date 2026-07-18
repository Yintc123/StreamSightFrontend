import { redirect } from 'next/navigation'

/**
 * Spec 012b §1.2 — 公開自助註冊已移除。
 *
 * 保留路由但永久導回登入首頁（`/`），對舊書籤 / 外連友善（不 404）。
 * 新增 admin 一律由已登入的 SUPER_ADMIN 於 CMS 內建立（spec 013b）。
 */
export default function RegisterPage(): never {
  redirect('/')
}
