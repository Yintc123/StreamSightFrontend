# Spec 001h：BFF 基礎建設 — 分散式追蹤（traceId 模組）

- **狀態**：Draft **v0.1**（2026-07-18）
- **建立日期**：2026-07-18
- **影響範圍**：`src/lib/observability/trace.ts`（新）、`src/instrumentation.ts`、`src/lib/api/backend.ts`、
  `src/lib/api/create-route.ts`、`src/lib/api/request-id.ts`、`src/lib/log.ts`、登入成功導向 Streamlit 的 handoff 點
- **依賴**：
  - [001a foundations](./001a-foundations.md)（`env`、`log`、constants）
  - [001e backendFetch](./001e-backend-fetch.md)（對後端呼叫的注入點；現有 `x-request-id`）
  - [001f createRoute](./001f-create-route.md)（入站 request 的 id 產生點）
  - [001g routes-and-lifecycle](./001g-routes-and-lifecycle.md)（`instrumentation.ts` 註冊點）
  - 外部標準 **W3C Trace Context**（`traceparent` / `tracestate`）、**OpenTelemetry**（JS + Python）
- **下游 / 相關服務（非本 repo）**：Streamlit 前端、真後端——皆須遵循本檔 §7 的傳遞契約
- **總覽**：見 [001 index](./001-bff-infrastructure.md)

> 動機：登入成功後使用者會前往 **Streamlit 前端**；一次使用者操作可能橫跨 Next.js BFF、後端、Streamlit
> 三個服務。需要一套「多服務可追蹤」的 correlation 機制。本檔定義 **traceId 模組** 與跨服務傳遞契約。

---

## 1. 目的與範圍

**目的**：讓「一次邏輯操作」在 Next.js BFF、後端、Streamlit 之間可被關聯追蹤，且與業界工具
（OpenTelemetry / Jaeger / Tempo / Datadog）相容。

**範圍內**
- `traceId` 模組（`src/lib/observability/trace.ts`）：取得 / 建立 / 續傳 trace context 的薄封裝。
- 入站：從 request header 萃取 `traceparent`（有則續傳、無則開新 trace）。
- 出站（服務對服務）：`backendFetch` 對後端注入 `traceparent`。
- log 整合：結構化 log 補 `traceId` / `spanId`（與既有 `requestId` / `sessionId` 並存）。
- **瀏覽器換頁到 Streamlit 的 handoff 契約**（§5.3——本檔重點，最易做錯處）。

**範圍外**
- 各服務內部的細粒度 span 佈建（交各服務自行以 OpenTelemetry instrument）。
- Streamlit / 後端的實作（僅在 §7 定義它們必須遵守的契約）。
- 認證 handoff 本身（token/SSO/cookie）——另立 spec；本檔只規範 correlation id 如何搭它便車（§5.3）。
- 指標（metrics）與日誌集中化基礎設施（log/trace backend 選型）——營運 spec。

---

## 2. 名詞：三種 id，別混用

| id | 範圍 | 現況 | 用途 |
|---|---|---|---|
| `requestId` | **單一 request 的一跳** | 已有（`x-request-id`，`request-id.ts`） | 人類友善的 log key；一次 BFF→後端呼叫鏈 |
| `traceId`（+`spanId`） | **一次邏輯操作跨多個服務**的整條 trace | 本檔新增 | 分散式追蹤；把各服務的 span 串成一棵樹 |
| `sessionId` | **使用者旅程**，跨多個 request / 服務 | 已有（iron-session） | 把「登入」與後續（含 Streamlit）活動關聯到同一使用者 |

> 決策準則：**「一次操作跨服務」→ `traceId`**；**「跨多次請求的使用者旅程」→ `sessionId`**。二者常常都要記。
> `requestId` 保留為每一跳的 log key，不取代 `traceId`（一條 trace 可含多個 requestId）。

---

## 3. 標準選型：`traceparent`，不自訂 `traceId` header

- **採用 W3C Trace Context**：`traceparent`（必要）+ `tracestate`（選用），而非自訂 `X-Trace-Id` header。
  - 理由：跨語言（Next.js JS、Streamlit Python、後端）由 OpenTelemetry SDK **自動注入 / 萃取**；與 Jaeger / Tempo /
    Datadog 等相容；自訂 header 需各服務手刻傳遞且工具不認。
- `traceparent` 格式：`00-<32 hex traceId>-<16 hex spanId>-<flags>`（例：`00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`）。
- **導入 OpenTelemetry**：本 repo 目前**無 OTel 依賴**（`package.json` 未含）。需新增
  `@vercel/otel`（最省事，Next.js 官方整合）或 `@opentelemetry/*` SDK，於 `instrumentation.ts` 註冊（§5.1）。
- 與現有 `requestId` 的關係：`requestId` 續存為 log 欄位；可（選）令其等於當前 `spanId` 或維持獨立隨機值——
  **定案：維持獨立**（`requestId` 為人類友善、`spanId` 為 16-hex 標準），兩者都進 log。

---

## 4. `traceId` 模組（`src/lib/observability/trace.ts`，新）

薄封裝 OpenTelemetry trace API，讓業務碼不直接相依 OTel 細節。**server-only**。

```ts
// 皆為純讀當前 context，不自行管理 span 生命週期（span 由 OTel auto-instrumentation 開）。
export function currentTraceId(): string | null   // 32-hex；無 active span 時 null
export function currentSpanId(): string | null    // 16-hex
export function traceparentHeader(): string | null // 組出 `traceparent` 值（給非 OTel 自動注入的手動場景）

/** 對外注入用：回傳應加到出站 request 的 trace headers（OTel propagator 產出）。 */
export function outboundTraceHeaders(): Record<string, string>  // { traceparent, tracestate? }

/** 入站續傳用：把 request header 的 traceparent 解析成可續接的 context（供手動場景）。 */
export function traceFieldsForLog(): { traceId: string | null; spanId: string | null }
```

- **實作策略**：OTel 的 `@vercel/otel` 會**自動** instrument Next.js 進站 request 與 `fetch` 出站呼叫，
  多數情況 `traceparent` 傳遞是自動的。本模組主要提供 **log 取值**（`traceFieldsForLog`）與**手動注入**
  （`outboundTraceHeaders`，供 §5.3 換頁 handoff 這種 OTel 不覆蓋的路徑）。
- **無 active span 時**：`current*` 回 `null`；log 欄位留 `null`，不得 throw。
- **強制 TDD**：`currentTraceId`/`currentSpanId` 在有/無 active span 的回傳；`outboundTraceHeaders` 產出合法
  `traceparent`；`traceFieldsForLog` null 安全。

---

## 5. 傳遞路徑

### 5.1 服務對服務（自動；OTel）

- **註冊**：`instrumentation.ts` 的 `register()` 內，`NEXT_RUNTIME === 'nodejs'` 時 `registerOTel({ serviceName: 'streamsight-bff' })`（`@vercel/otel`）。
- **入站**：OTel 自動從 request 的 `traceparent` 續接（有則同 trace、無則開新 root）。
- **出站**：`backendFetch` 對後端的 `fetch` 由 OTel 自動注入 `traceparent`。**保留現有 `x-request-id`**（並存，非取代）。
  - 若某路徑未被自動 instrument，改用 `outboundTraceHeaders()` 手動並入 `headers`（§4）。
- 後端須「續接 traceparent 並回報同一 traceId」（§7）。

### 5.2 入站 request 的 id 關聯（`createRoute`）

- `createRoute` 產生 `requestId`（現況不變）**並**讀當前 `traceFieldsForLog()`，把 `traceId`/`spanId` 一併帶進
  該 request 的 log context（`bff.request.in` / `bff.response.out` / 錯誤回應）。
- 對外**錯誤回應**：維持既有 `{ error: { code, message, requestId } }`；**可（選）**增列 `traceId` 方便用戶回報時貼給後台查詢。定案：**增列 `traceId`**（非 PII，見 §8）。

### 5.3 ⚠️ 瀏覽器換頁到 Streamlit（header 傳不動——本檔重點）

登入成功 → 導向 Streamlit 是**瀏覽器頂層導航**（`redirect` / `window.location` / `<a>`），
**無法設任意 request header**，故 `traceparent` 在這一跳**失效**；且瀏覽器換頁本質上會開一條新的 client 端 trace。

**契約（擇一或並用）**：
1. **沿用 `sessionId`（建議、最穩）**：Streamlit 與 Next 共享認證時，handoff 帶入 `sessionId`（或其衍生的
   不可逆 correlation id）；Next 與 Streamlit 兩邊 log 都記此 id → 使用者旅程可關聯。
2. **query 帶 correlation id**：導向 URL 加 `?trace_id=<32hex>`（或簽章短時效 token）；Streamlit 以 `st.query_params`
   讀取，當作該 session 的 **root traceId**（後續 Streamlit→後端的 span 掛在其下）。
3. **共用 cookie**（同上層網域時）：寫一個 `x-correlation-id` cookie，Streamlit 讀取。

**定案**：以 **`sessionId` 關聯使用者旅程**為主；若要「操作級」跨服務 trace，額外用**方式 2** 帶一個
`trace_id`，由 Streamlit 當 root。**嚴禁**把 session token / 憑證塞進 query（§8）。

> 澄清常見誤解：一次 top-level 換頁天生開新 trace，這一跳的「連續性」靠 **sessionId / 明確傳入的 root traceId**
> 建立，不是靠 `traceparent`。

---

## 6. log 整合（`src/lib/log.ts`）

- 結構化 log 每筆補上 `traceId` / `spanId`（取自 §4），與既有 `requestId` / `sessionId`（遮罩後）並存。
- 三個服務（BFF / 後端 / Streamlit）**統一欄位名**：`trace_id` / `span_id` / `session_id` / `request_id`，
  集中到同一 trace/log 後端才能跨服務 pivot。
- 遮罩規則沿用 001a（`maskSessionId` 等）；`traceId`/`spanId` **非機密**，明文輸出。

---

## 7. 其他服務必須遵守的契約（後端 / Streamlit）

| 服務 | 入站 | 出站 | log |
|---|---|---|---|
| 後端 | 續接 `traceparent`（有則同 trace） | 對下游注入 `traceparent` | 印 `trace_id`/`span_id`/`request_id`（回應 header 回填 `x-request-id`） |
| Streamlit | 讀 §5.3 的 `sessionId` / `trace_id`（query/cookie）當 root | 對後端呼叫注入 `traceparent`（OTel Python） | 印 `trace_id`/`session_id` |

- 三方 `serviceName`：`streamsight-bff` / `streamsight-backend` / `streamsight-streamlit`。
- 皆送同一 OTLP collector / trace 後端（營運 spec 定義端點）。

---

## 8. 安全 / 隱私

- `traceId` / `spanId` **不得含 PII**（純隨機 hex，天然滿足）。可安全放 log、錯誤回應、query。
- **嚴禁**把 `sessionId` 原值、access/refresh token、CSRF token 放進 URL query（會進瀏覽器歷史 / referrer / server log）。
  - 若 §5.3 方式 1 要在 query 傳關聯 id，須用 **sessionId 的不可逆衍生值**或**簽章短時效一次性 token**，不得可反推 session。
- `tracestate` 不放機密。

---

## 9. 實作順序（TDD）

1. **依賴**：加 `@vercel/otel`（或 OTel SDK）。
2. **traceId 模組**（§4）：`src/lib/observability/trace.ts` + 單元測試（有/無 active span、header 產出、null 安全）。
3. **instrumentation**（§5.1）：`register()` 內註冊 OTel（`serviceName: 'streamsight-bff'`）。
4. **log 欄位**（§6）：`log` 補 `traceId`/`spanId`；`createRoute` 帶入 log context（§5.2）。
5. **backendFetch**（§5.1）：確認出站 `traceparent` 自動注入；未覆蓋處以 `outboundTraceHeaders()` 補；保留 `x-request-id`。
6. **錯誤回應**（§5.2）：envelope 增列 `traceId`。
7. **Streamlit handoff**（§5.3）：登入成功導向 Streamlit 時帶 `sessionId`（及選用 `trace_id`）；定義 URL 契約。
8. **驗證**：跨服務打一條 request，確認 BFF↔後端同 `traceId`；換頁到 Streamlit 後由 `sessionId`/`trace_id` 可關聯。

每步先紅後綠。§7 涉及後端 / Streamlit 的部分為跨 repo 協調項。

---

## 10. 驗收清單

- [ ] `trace.ts`：`currentTraceId`/`currentSpanId` 在有 active span 回 32-/16-hex、無則 `null`；`outboundTraceHeaders()` 產合法 `traceparent`；全數 null 安全。
- [ ] `instrumentation.ts` 註冊 OTel（`serviceName='streamsight-bff'`），dev / prod 皆載入。
- [ ] BFF 入站帶 `traceparent` → log 的 `traceId` 與上游一致；無則開新 root。
- [ ] `backendFetch` 出站帶 `traceparent`；後端 log 出現**同一** `traceId`；`x-request-id` 仍保留。
- [ ] log 每筆含 `traceId`/`spanId`/`sessionId`（遮罩）/`requestId`。
- [ ] 對外錯誤回應含 `traceId`（且不含任何 PII / token）。
- [ ] 登入成功導向 Streamlit：URL 依 §5.3 契約帶 `sessionId`（+選用 `trace_id`）；**query 內無 session token**。
- [ ] Streamlit 端能以該 id 關聯回登入的使用者（跨 repo 驗證）。

---

最後更新：2026-07-18（v0.1，新增 traceId 模組與跨服務追蹤契約；含 Streamlit 換頁 handoff）
