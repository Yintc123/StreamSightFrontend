# Spec 008：捐款 / 購買 bottom-sheet 結帳（index）

- **狀態**：Draft（v0.7 — enum / payload / URL 全面對齊 backend spec 021 / 022，避免 BFF mapping 層）
- **建立日期**：2026-06-15
- **Figma 對應**：IMG_4885（charity 捐款設定）/ IMG_4886（donation 捐款設定，內容同 4885）/ IMG_4887（sale-item 購買數量）

> **範圍邊界**：依 brief.md「捐款流程 CTA 只刻 UI 不接金流」，整套 spec **不**涵蓋「下一步」之後的付款 / 確認 / 完成頁。Sheet 內所有送出動作只 `console.log` + 關閉 sheet 作為 placeholder。

---

## 1. 為什麼拆 spec

v0.1～v0.3 把通用 UI primitive（modal 機制 / focus trap / 動畫）、兩種 business form（捐款設定 vs 購買數量）、以及 detail page 整合膠水**全部塞在同一檔 810 行**。v0.4 拆四份：

| Spec | 內容 | 跨頁複用度 |
|---|---|---|
| **008（本檔，index）** | 整體架構、CtaIsland 整合表、跨 spec 路徑圖 | — |
| [**008a BottomSheet**](./008a-bottom-sheet.md) | UI primitive：modal 機制（backdrop / panel / 動畫 / focus trap / scroll lock / a11y） | 高（未來其他 modal 可重用） |
| [**008b DonationSettingsSheet**](./008b-donation-settings-sheet.md) | Business form：捐款設定（type / day / amount 含 discriminated union）；charity + donation 共用 | 中（兩個 detail page 共用） |
| [**008c PurchaseQtySheet**](./008c-purchase-qty-sheet.md) | Business form：購買數量 + QtyStepper UI primitive | 中（item detail 專用；但 QtyStepper 可重用） |

對齊既有拆 spec 慣例（[003e](./003e-charity-card.md) cards index + 003e1/e2/e3/e4 子 spec）。

---

## 2. 元件路徑圖

```
<DetailPage> (RSC)
  └─ <CtaIsland> ('use client')             ← spec 008 §4（本檔）
        ├─ useState(open)
        ├─ useRef(triggerButtonRef)         ← 給 focus return 用
        ├─ <button onClick={open}>{label}</button>
        └─ <{Donation|Purchase}Sheet open={open} onClose={close} ...>
              ↑
              └─ DonationSettingsSheet → spec 008b
                 PurchaseQtySheet      → spec 008c
                    └─ <BottomSheet open={open} title onClose>  ← spec 008a
                          ├─ Backdrop
                          └─ Panel
                                ├─ Header (title + X)
                                └─ {children: form body + sticky footer button}
```

---

## 3. 「哪個 detail page → 開哪個 sheet」契約

| Detail page | CTA label | Sheet | 對應 Spec |
|---|---|---|---|
| `/charities/:id` | 「直接捐款給團體」 | `<DonationSettingsSheet>` | [008b](./008b-donation-settings-sheet.md) |
| `/donation-projects/:id` | 「立即捐款」 | `<DonationSettingsSheet>` | [008b](./008b-donation-settings-sheet.md) |
| `/sale-items/:id` | 「立即捐款」 | `<PurchaseQtySheet>` | [008c](./008c-purchase-qty-sheet.md) |

DonationSettingsSheet 在 charity / donation 兩種 target 共用同一份元件，差別只在 caller 傳的 `target.type`（`'CHARITY'` vs `'DONATION_PROJECT'`，對齊 BE OrderSubjectType；見 [008b submit payload](./008b-donation-settings-sheet.md#52-submit-payload)）。

---

## 4. `<CtaIsland>` integration（detail page 接 sheet 的膠水）

每個 detail page 用一個 client island 持 `open` state + ref（給 [008a §6.3 focus return](./008a-bottom-sheet.md#63-focus-return) 用）。

### 4.1 共用 CtaIsland 設計

兩個 variant：

```tsx
// src/app/checkout/CtaIsland.tsx ('use client')
// v0.7 — type 對齊 BE OrderSubjectType（CHARITY / DONATION_PROJECT / SALE_ITEM）
type DonationTarget = { type: 'CHARITY' | 'DONATION_PROJECT'; id: string }

type CtaIslandProps = {
  label: string
  sticky?: boolean         // true → 外包 sticky bottom wrapper（donation/item 用）
} & ({ kind: 'donation'; target: DonationTarget }
   | { kind: 'purchase'; item: Item })

export function CtaIsland(props: CtaIslandProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()      // 008a §6.3 focus return
  }
  const button = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen(true)}
      className="w-full h-12 rounded-full bg-brand text-white text-base font-semibold
                 focus-visible:outline focus-visible:outline-2
                 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {props.label}
    </button>
  )
  const wrapper = props.sticky
    ? <div className="sticky bottom-0 inset-x-0 bg-surface-card border-t border-line px-5 py-3 pb-[env(safe-area-inset-bottom)] z-30">{button}</div>
    : button
  return (
    <>
      {wrapper}
      {props.kind === 'donation'
        ? <DonationSettingsSheet open={open} onClose={close} target={props.target} />
        : <PurchaseQtySheet open={open} onClose={close} item={props.item} />}
    </>
  )
}
```

> z-index 規範（[008a §3.2](./008a-bottom-sheet.md#32-z-index-規範)）：sticky wrapper `z-30` < backdrop `z-40` < panel `z-50`。

### 4.2 各 detail page 的取代規則

| Detail page | 現況 CTA placeholder | 取代為 |
|---|---|---|
| charity | **in-card** static button `<DirectDonateCta>`（[004a v0.2 §3](./004a-charity-detail.md)） | `<CtaIsland kind="donation" target={{type:'CHARITY', id}} label="直接捐款給團體" />`（sticky=false） |
| donation | **sticky bottom** `<DonateCta>` 的 `<div className="sticky bottom-0 ...">` | `<CtaIsland kind="donation" target={{type:'DONATION_PROJECT', id}} label="立即捐款" sticky />` |
| item | **sticky bottom** `<DonateCta>` 同上 | `<CtaIsland kind="purchase" item={item} label="立即捐款" sticky />` |

> v0.4 spec 008 不改 CTA 的「位置」（sticky vs in-card），只改 CTA 的「行為」（從 `console.log` placeholder 改為打開 sheet）。位置策略由 [spec 004a/b/c](./004-detail-pages.md) 決定。

---

## 5. 跨 spec 共同決策（為何同樣寫一次）

| 決策 | 載於 | 在這裡複述的理由 |
|---|---|---|
| **caller pattern**：始終 mount sheet、不要 `{open && ...}` 不要 `key` reset | [008a §5](./008a-bottom-sheet.md#5-caller-模式) + [008b §3.5](./008b-donation-settings-sheet.md) + [008c §3.3](./008c-purchase-qty-sheet.md) | 三個地方都要記、避免 future contributor 重蹈 v0.2 `key` 覆轍 |
| **form reset on open**：sheet body 用 `useEffect(() => { if (open) reset() }, [open])`（reducer 版：dispatch RESET） | 同上 | 跟 [008a §4 isExiting](./008a-bottom-sheet.md#4-動畫機制isexiting-pattern) 退場動畫並存 |
| **Portal 必用**（v0.5）：`createPortal(tree, document.body)` + `mounted` SSR guard | [008a §3.3](./008a-bottom-sheet.md#33-react-portalv02--must) | 避免 ancestor `transform/filter` 偷走 `fixed` 的 containing block |
| **`<form onSubmit>` semantic**（v0.5）：sheet body 包 `<form>`、submit button 用 `type="submit"`、handler `preventDefault` | [008b §4.5](./008b-donation-settings-sheet.md) + [008c §4.3](./008c-purchase-qty-sheet.md) | input Enter / iOS Done 鍵自動 submit；SR friendly；native disabled gate |
| **form state 用 `useReducer`**（v0.5 — DonationSettings 必用、PurchaseQty 可用 useState） | [008b §3.2 reducer](./008b-donation-settings-sheet.md) | cross-field transition ≥ 3 條 → reducer 把所有 transition 集中、可獨立 pure unit test、easier review |
| **Controlled input 拆 raw 與 parsed 兩欄**（v0.5 — 只 008b 用） | [008b §3.1](./008b-donation-settings-sheet.md) | 解使用者刪字時整欄被清空的 ghost-reset bug；通則：「parse 結果可能 null 的 controlled input 都該拆兩欄」 |
| **Container / Presentational 分層**（v0.6）：每個 form-bearing component 抽 `useXxxForm` custom hook 把 useReducer + isValid + handleSubmit + router.push 從 React component 移出；component 變純 props → JSX | [008b §3.6](./008b-donation-settings-sheet.md) / [008c §3.4](./008c-purchase-qty-sheet.md) / [009a §5.6](./009a-donation-confirm.md) / [009b §6.3](./009b-purchase-confirm.md) | hook 可獨立 `renderHook` 測（不需 DOM / 不需 mock sonner）；換 form library / 加 mutation 只動 hook；對齊現有 `useDebouncedValue` / `useViewport` 等專案內 hook 慣例 |
| **三層 test plan**（v0.6）：reducer pure → hook integration → component visual | 同上 | 「能在底層測就不要拉到上層」；pure function 跑最快、component test 只覆蓋視覺整合不重複邏輯 |
| **a11y modal level**（focus trap / scroll lock / esc / role=dialog）由 BottomSheet 提供 | [008a §6](./008a-bottom-sheet.md#6-a11y--鍵盤) | sheet body spec 不重複 |
| **a11y form level**（radio group / aria-label）由 sheet body 提供 | [008b §6](./008b-donation-settings-sheet.md#6-a11y) / [008c §6](./008c-purchase-qty-sheet.md#6-a11y) | BottomSheet 不知道 form 內容 |
| **enum / payload 命名一律對齊 backend** (v0.7)：`DonationFrequency` / `BillingDay` / `ReceiptOption` / `OrderSubjectType` 直接沿用 [BE 021 §5 Prisma enum](../../../backend/docs/specs/021-donation-order-data-model.md)；payload field 名（`donorName` / `amountTwd` / `isAnonymous` / `saleItemId` / `quantity`）直接沿用 [BE 022 §4 body](../../../backend/docs/specs/022-donation-order-api.md) | [008b §3.1](./008b-donation-settings-sheet.md) / [008c §3.1](./008c-purchase-qty-sheet.md) / [009 §2](./009-checkout-confirm.md) | 採 Option C 對齊；BFF route handler 收到 FE payload 後可直接 forward 給 BE，**不需 mapping 層**；未來換 BFF / 接金流時 server-side 只需補 donorName / receiptOption / isAnonymous 等欄位、不需重新對欄位 |

---

## 6. 整合 e2e（未來可加，本 spec 不強制）

`tests/e2e/checkout.spec.ts` 規劃：

- charity detail 點「直接捐款給團體」→ sheet 出現 + 標題「捐款設定」
- 完整 fill（RECURRING + DAY_6 + amountTwd=100）→「下一步」可點
- 點 X / esc / backdrop 都能關 sheet
- item detail 點「立即捐款」→ 標題「購買數量」+ quantity 預設 1 + 總計正確
- 點 + 三次 → 總計 = `priceTwd * 4`
- 開 sheet → 不關閉、refresh → form 不保留（v0.1 不存草稿）

需要 backend mock dispatcher 提供穩定的 charity / donation / item id（uuid v4）。

---

## 7. 開放問題（跨 spec）

子 spec 各自的開放問題（密碼上限、商品變體、運費 API 等）在子 spec 的 §8。本檔只放跨 spec 的：

- **「下一步」之後**：目前定為 `console.log`。接金流時要設計：信用卡 / Apple Pay / Line Pay 選擇頁 → 確認頁 → 結果頁；可能改成 `router.push('/checkout/...')` 並把 form 帶在 URL / draft id。所有三個 sheet 統一處理
- **草稿保留**：使用者填一半關掉 sheet，下次打開要不要記住？v0.1 一律不記。商業考量在「結帳放棄率」高時值得加 sessionStorage
- **跨頁 form state**：「下一步」→ payment 頁顯示同樣的 form 預覽。三個常見做法：URL query / sessionStorage / server-side draft id。v0.1 不選擇，留到接金流再評估

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：規劃 BottomSheet 基底 + DonationSettingsSheet + PurchaseQtySheet 三個元件；列三個詳情頁 CTA 觸發整合；驗證規則、a11y、9+9+7 個 test case；未實作 |
| 0.2 | 2026-06-15 | 補完開發前缺口：safe-area / initial focus / focus return / focus trap reference / 離場動畫 isExiting state / 視覺規格（segmented 黑勾、pill selected `border-2 border-ink-AAA`、TWD input 前綴 adornment、disabled CTA 淺灰）/ submit payload type / QtyStepper className / CtaIsland 位置表 / form reset 用 caller `key` |
| 0.3 | 2026-06-15 | 解掉 v0.2 兩個 logical 矛盾：(A) form reset 撤回 `key`、改 useEffect-on-open；(B) Amount 改 discriminated union `AmountState` + `parseAmount` 規則 + input 受控綁定。並補 `SHEET_TRANSITION_MS` 常數、caller pattern 反面範例、`<CtaIsland sticky?>` prop + z-index 規範 |
| 0.4 | 2026-06-15 | **拆 spec**：v0.3 的 810 行依「UI primitive vs business form」分為 008（index，本檔）+ [008a](./008a-bottom-sheet.md) BottomSheet + [008b](./008b-donation-settings-sheet.md) DonationSettings + [008c](./008c-purchase-qty-sheet.md) PurchaseQty。CtaIsland integration 留在本檔 §4。對齊 [003e](./003e-charity-card.md) cards 系列拆 spec 慣例 |
| 0.5 | 2026-06-15 | **production 最佳實踐補完**：(1) [008a v0.2](./008a-bottom-sheet.md) BottomSheet 用 React **Portal**（`createPortal(tree, document.body)` + `mounted` SSR guard），避免未來 ancestor `transform/filter` 偷走 `fixed` 定位；(2) [008b v0.2](./008b-donation-settings-sheet.md) DonationSettings 改 **`useReducer`** + **`amountInputRaw` 拆兩欄**，解使用者刪字時 ghost-reset bug；(3) [008b](./008b-donation-settings-sheet.md) / [008c v0.2](./008c-purchase-qty-sheet.md) 整 sheet body 包 **`<form onSubmit>`**、submit button `type="submit"`，支援 Enter / iOS Done 鍵 submit。index §5 共同決策表加 4 條 cross-spec 規則 |
| 0.6 | 2026-06-15 | **Container / Presentational 分層**：[008b v0.4](./008b-donation-settings-sheet.md) `useDonationSettingsForm` + [008c v0.4](./008c-purchase-qty-sheet.md) `usePurchaseQtyForm` + [009a v0.2](./009a-donation-confirm.md) `useDonorInfoForm` + [009b v0.2](./009b-purchase-confirm.md) `useReceiptInfoForm` 四個 custom hook 把 React 整合層從 component 移出；component 變純 UI（純 props → JSX、零 useReducer/useEffect/useRouter 呼叫）。對應 test plan 升級為三層：reducer pure / hook integration / component visual。index §5 共同決策表加 2 條 |
| 0.7 | 2026-06-15 | **enum / payload / URL 全面對齊 backend spec 021 / 022**（Option C）：[008b v0.5](./008b-donation-settings-sheet.md) + [008c v0.5](./008c-purchase-qty-sheet.md) 同步改寫；CtaIsland 的 `target.type` 從 `'charity'\|'donation'` 改為 `'CHARITY'\|'DONATION_PROJECT'`（對齊 BE OrderSubjectType）；§4.2 detail page 取代規則同步；§5 共同決策表新增一條「enum / payload 命名一律對齊 backend」總綱；§6 e2e 規劃描述更新為 BE 命名 |
