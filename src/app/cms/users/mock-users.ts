// Spec 011 §5 — 靜態 UI 階段的假資料。
//
// 純視覺 / 排版驗證用：無 fetch、無 BFF、無 session gate。等 §5.4 BFF route
// 落地後，這份會被 `GET /api/cms/users` 的回應取代（形狀對齊 §5.3 的
// client-facing camelCase：isActive / createdAt）。

export type CmsUser = {
  id: number
  name: string
  email: string
  isActive: boolean
  /** ISO 8601；UI 以 YYYY/MM/DD 顯示 */
  createdAt: string
}

export const MOCK_USERS: CmsUser[] = [
  { id: 1, name: '陳怡君', email: 'yijun.chen@example.com', isActive: true, createdAt: '2026-07-02T08:14:00Z' },
  { id: 2, name: '林大衛', email: 'david.lin@example.com', isActive: true, createdAt: '2026-07-04T02:41:00Z' },
  { id: 3, name: '王曉明', email: 'ming.wang@example.com', isActive: false, createdAt: '2026-07-05T15:09:00Z' },
  { id: 4, name: 'Alice Wu', email: 'alice.wu@example.com', isActive: true, createdAt: '2026-07-08T11:52:00Z' },
  { id: 5, name: '張佳蓉', email: 'jiarong.chang@example.com', isActive: false, createdAt: '2026-07-11T19:33:00Z' },
  { id: 6, name: 'Ken Ho', email: 'ken.ho@example.com', isActive: true, createdAt: '2026-07-14T06:20:00Z' },
]
