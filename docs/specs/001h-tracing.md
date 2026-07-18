# Spec 001h：BFF 基礎建設 — 分散式追蹤（traceId 模組）

- **狀態**：Draft **v0.2**（2026-07-18）
- **建立日期**：2026-07-18
- **影響範圍**：`src/lib/observability/trace.ts`（新）、`src/instrumentation.ts`、`src/lib/lifecycle.ts`（span flush）、
  `src/lib/api/backend.ts`、`src/lib/api/create-route.ts`、`src/lib/api/request-id.ts`、`src/lib/log.ts`、
  登入成功導向 Streamlit 的 handoff 點
- **依賴**：
  - [001a foundations](./001a-foundations.md)（`env`、`log`、constants）
  - [001e backendFetch](./001e-backend-fetch.md)（對後端呼叫的注入點；現有 `x-request-id`）
  - [001f createRoute](./001f-create-route.md)（入站 request 的 id 產生點）
  - [001g routes-and-lifecycle](./001g-routes-and-lifecycle.md)（`instrumentation.ts` 註冊點 + graceful shutdown，§7 span flush 相依）
  - 外部標準 **W3C Trace Context**（`traceparent`）、**W3C Baggage**（`baggage`）、**OpenTelemetry**（JS + Python）
  - Next.js 官方 OTel 指引（`node_modules/next/dist/docs/01-app/02-guides/open-telemetry.md`，2026-07-18 已讀，本檔對齊）
- **下游 / 相關服務（非本 repo）**：Streamlit 前端、真後端——皆須遵循本檔 §9 的傳遞契約
- **部署目標**：**GCP Cloud Run**（多 instance、scale-to-zero、SIGTERM graceful shutdown）——影響取樣（§6）與匯出/flush（§7）
- **總覽**：見 [001 index](./001-bff-infrastructure.md)

> 動機：登入成功後使用者會前往 **Streamlit 前端**；一次使用者操作可能橫跨 Next.js BFF、後端、Streamlit
> 三個服務。需要一套「多服務可追蹤」的 correlation 機制。本檔定義 **traceId 模組** 與跨服務傳遞契約。
>
> **v0.2 變更（回應架構審視）**：補 §5.4 Baggage、§6 取樣策略、§7 匯出與部署（Cloud Run/GCP + span flush）、
> §1 明訂瀏覽器 RUM 為範圍外、§3 精確依賴清單與 Next 專屬設定。核心決策（W3C Trace Context + `@vercel/otel`、
> 不自訂 header、瀏覽器換頁走 session/query）維持 v0.1，且經 Next 16 官方 doc 驗證。

---

## 1. 目的與範圍

**目的**：讓「一次邏輯操作」在 Next.js BFF、後端、Streamlit 之間可被關聯追蹤，且與業界工具
（OpenTelemetry / Jaeger / Tempo / Cloud Trace / Datadog）相容。

**範圍內**
- `traceId` 模組（`src/lib/observability/trace.ts`）：取得 / 續傳 trace context 的薄封裝。
- 入站：從 request header 萃取 `traceparent`（有則續傳、無則開新 trace）。
- 出站（服務對服務）：`backendFetch` 對後端注入 `traceparent` + `baggage`。
- **跨服務 context**：以 W3C Baggage 傳 `session.id` / `enduser.id`（§5.4）。
- **取樣策略**（§6）與 **匯出 / Cloud Run flush**（§7）。
- log 整合：結構化 log 補 `traceId` / `spanId`（與既有 `requestId` / `sessionId` 並存）。
- **瀏覽器換頁到 Streamlit 的 handoff 契約**（§5.3——最易做錯處）。

**範圍外**
- **瀏覽器 / 客戶端 RUM tracing（定案：本期不做）**：從使用者點擊起 trace（OTel browser SDK）。本期 trace 從
  **BFF / RSC 進站**起算即可——理由：CMS 為內部 admin 工具，server-side trace 已足夠診斷後端鏈路；瀏覽器 RUM
  的成本 / 隱私 / CORS-traceparent 傳遞較高。**列為未來**（屆時另開 spec，含 `document` 端 propagation 與同意機制）。
- 各服務內部細粒度 span 佈建（交各服務自行 instrument）。
- Streamlit / 後端內部實作（僅在 §9 定義它們必須遵守的契約）。
- 認證 handoff 本身（token/SSO/cookie）——另立 spec；本檔只規範 correlation id 如何搭它便車（§5.3）。
- 指標（metrics）與 log/trace backend 選型細節——營運 spec；本檔只定 §7 兩條匯出路徑。

---

## 2. 名詞：三種 id，別混用

| id | 範圍 | 現況 | 用途 |
|---|---|---|---|
| `requestId` | **單一 request 的一跳** | 已有（`x-request-id`，`request-id.ts`） | 人類友善的 log key；一次 BFF→後端呼叫鏈 |
| `traceId`（+`spanId`） | **一次邏輯操作跨多個服務**的整條 trace | 本檔新增 | 分散式追蹤；把各服務的 span 串成一棵樹 |
| `sessionId` | **使用者旅程**，跨多個 request / 服務 | 已有（iron-session） | 把「登入」與後續（含 Streamlit）活動關聯到同一使用者 |

> 決策準則：**「一次操作跨服務」→ `traceId`**；**「跨多次請求的使用者旅程」→ `sessionId`（經 Baggage 傳遞，§5.4）**。
> 二者常常都要記。`requestId` 保留為每一跳的 log key，不取代 `traceId`（一條 trace 可含多個 requestId）。

---

## 3. 標準選型與依賴：`@vercel/otel`

- **採用 W3C Trace Context（`traceparent`）+ OpenTelemetry**，而非自訂 `X-Trace-Id` header。理由：跨語言自動傳遞、
  與工具相容；自訂 header 需各服務手刻。Next 16 官方 doc **明確推薦 OpenTelemetry 並提供 `@vercel/otel`**，且 Next 已
  **內建自動 instrument**（root server span `GET /pathname` + 巢狀 span、`fetch` 出站）。
- **為何 `@vercel/otel`（而非手動 `NodeSDK`）**：官方指出 `@vercel/otel` **Vercel 與自架皆可**、且是**唯一支援 edge
  runtime** 的方案；手動 `NodeSDK` 不支援 edge。本專案雖為 node runtime，仍採 `@vercel/otel` 保留彈性與最少樣板。
- **依賴清單（精確）**：
  ```
  @vercel/otel
  @opentelemetry/api              # trace 模組讀 active span context（§4）
  @opentelemetry/sdk-logs         # 官方 @vercel/otel 路徑要求
  @opentelemetry/api-logs
  @opentelemetry/instrumentation
  ```
  - 若走 §7 的 **GCP Cloud Trace 直匯**，另加 `@google-cloud/opentelemetry-cloud-trace-exporter`（並改用 custom exporter 設定）。
- **Next 專屬設定**：
  - `NEXT_OTEL_VERBOSE=1` → 輸出更多 Next 內部 span（診斷用）。
  - **edge/node**：`registerOTel()` 可放在 `NEXT_RUNTIME` 守衛**外**（`@vercel/otel` 支援 edge）；現有
    `instrumentation.ts` 的 `NEXT_RUNTIME === 'nodejs'` 守衛僅供 lifecycle / mock，**不要**把 `registerOTel` 關進去。
- 與現有 `requestId` 的關係：**定案維持獨立**（`requestId` 人類友善、`spanId` 為 16-hex 標準），兩者都進 log。

---

## 4. `traceId` 模組（`src/lib/observability/trace.ts`，新）

薄封裝 `@opentelemetry/api`，讓業務碼不直接相依 OTel 細節。**server-only**。

```ts
// 皆為純讀當前 context，不自行管理 span 生命週期（span 由 Next/OTel auto-instrumentation 開）。
export function currentTraceId(): string | null   // 32-hex；無 active span 時 null
export function currentSpanId(): string | null    // 16-hex
export function traceFieldsForLog(): { traceId: string | null; spanId: string | null } // null 安全

/** 出站手動注入（供 §5.3 換頁 handoff 等 OTel 不自動覆蓋的路徑）。 */
export function outboundTraceHeaders(): Record<string, string>  // { traceparent, baggage? }

/** Baggage 讀寫（§5.4）：僅非機密的 correlation 值。 */
export function setBaggage(entries: { sessionId?: string; userId?: string }): void
export function baggageFieldsForLog(): { sessionId: string | null; userId: string | null }
```

- **實作策略**：`@vercel/otel` 自動 instrument 進站 request 與 `fetch` 出站，多數 `traceparent` 傳遞是自動的。
  本模組主要提供 **log 取值** 與 **手動注入 / Baggage**（OTel 不覆蓋的換頁路徑）。
- **無 active span 時**：`current*` 回 `null`；log 欄位留 `null`，**不得 throw**。
- **強制 TDD**：有/無 active span 的回傳；`outboundTraceHeaders` 產合法 `traceparent`；Baggage set→讀回；全數 null 安全。

---

## 5. 傳遞路徑

### 5.1 服務對服務（自動；OTel）

- **註冊**：`instrumentation.ts` 的 `register()` 內 `registerOTel({ serviceName: 'streamsight-bff', traceSampler: <§6> })`。
- **入站**：OTel 自動從 request 的 `traceparent` 續接（有則同 trace、無則開新 root）。
- **出站**：`backendFetch` 對後端的 `fetch` 由 OTel 自動注入 `traceparent`（+ `baggage`，§5.4）。**保留現有 `x-request-id`**。
  - 未被自動 instrument 的路徑，改用 `outboundTraceHeaders()` 手動並入 `headers`（§4）。
- 後端須「續接 traceparent 並回報同一 traceId」（§9）。

### 5.2 入站 request 的 id 關聯（`createRoute`）

- `createRoute` 產生 `requestId`（現況不變）**並**讀 `traceFieldsForLog()` / `baggageFieldsForLog()`，把
  `traceId`/`spanId`/`sessionId`/`userId` 帶進該 request 的 log context。
- **有 session 時**：以 `setBaggage()` 把 `session.id`（衍生值，§10）/`enduser.id` 放進 Baggage，讓下游服務共享（§5.4）。
- 對外**錯誤回應**：維持 `{ error: { code, message, requestId } }`，**增列 `traceId`**（非 PII，見 §10）方便用戶回報時貼給後台查詢。

### 5.3 ⚠️ 瀏覽器換頁到 Streamlit（header 傳不動——本檔重點）

登入成功 → 導向 Streamlit 是**瀏覽器頂層導航**，**無法設任意 request header**，故 `traceparent`/`baggage` 在這一跳
**失效**；且瀏覽器換頁本質上會開一條新的 client 端 trace。

**契約（定案：以 sessionId 關聯為主，操作級 trace 選用 query root）**：
1. **沿用 `sessionId`（主）**：Streamlit 與 Next 共享認證時，handoff 帶入 `sessionId` 的**衍生 correlation id**（§10）；
   兩邊 log 都記 → 使用者旅程可關聯。
2. **query 帶 correlation id（選用）**：導向 URL 加 `?trace_id=<32hex>`；Streamlit 以 `st.query_params` 讀，當作該
   session 的 **root traceId**（後續 Streamlit→後端 span 掛其下）。
3. **共用 cookie**（同上層網域時）：`x-correlation-id` cookie，Streamlit 讀取。

> **嚴禁**把 session token / 憑證塞進 query（§10）。一次 top-level 換頁天生開新 trace，連續性靠 **sessionId / 明確傳入
> 的 root traceId**，不是靠 `traceparent`。

### 5.4 Baggage：跨服務傳 `session.id` / `enduser.id`

- **服務對服務**（BFF→後端、Streamlit→後端）用 **W3C Baggage（`baggage` header）** 傳跨切 context，而非臨時塞欄位。
- 鍵名對齊 OTel semantic conventions：**`session.id`**、**`enduser.id`**（= principal_id）。
- 值的約束：**僅非機密**——`session.id` 用 **sessionId 的不可逆衍生值**（非原值/非 token）；`enduser.id` 用 principal_id
  （已是 opaque int）。**不得**含 email / 姓名 / raw token（§10）。
- 由 §5.2 在入站設定；OTel propagator 自動隨 `fetch` 傳遞；後端 / Streamlit 讀進各自 log。

---

## 6. 取樣策略（Sampling）

生產環境 trace 量 / 成本靠取樣控制。**定案（可調）**：

- **Sampler = `ParentBased(root = TraceIdRatioBased(ratio))`**：尊重上游取樣決定；只有 root（本服務起頭）才依比例。
- **比例**：dev / test = **1.0（全取）**；staging = **0.5**；**prod = 0.1（10%）**。以 env 覆寫，不寫死。
  - 標準 OTel env：`OTEL_TRACES_SAMPLER=parentbased_traceidratio`、`OTEL_TRACES_SAMPLER_ARG=0.1`；
    或 `registerOTel({ traceSampler })` 傳入。三服務用**相同**比例，否則 trace 會斷。
- **錯誤 / 慢請求不可漏**：head-based 比例會漏掉部分錯誤 trace。緩解二選一（定案：優先 (a)，有 Collector 時加 (b)）：
  - (a) **錯誤 log 一律帶 `traceId`**（§5.2）→ 即使該 trace 未取樣，仍可由 log 反查、必要時調高比例重現；
  - (b) **tail-based sampling 在 Collector**（§7）：對「含錯誤 / 高延遲」的 trace 取樣 100%。
- Cloud Run scale-to-zero：取樣決定在 root 服務做一次即隨 `traceparent` 傳遞，跨 instance 一致。

---

## 7. 匯出與部署（Cloud Run / GCP）

**兩條路徑（依 observability backend 選一；定案預設走 (A) 保持供應商中立）**：

- **(A) OTel Collector（OTLP，供應商中立，預設）**：Cloud Run app → OTLP →
  **Collector（獨立 Cloud Run service 或 sidecar）** → trace backend（Tempo / Jaeger / Datadog…）。
  用 `@vercel/otel` 預設 OTLP exporter；Collector 可做 §6(b) tail sampling、批次、重試。
- **(B) GCP Cloud Trace 直匯（GCP 原生，最省運維）**：
  `@google-cloud/opentelemetry-cloud-trace-exporter` 直送 Cloud Trace，免自架 Collector；需 custom exporter 設定。
  適合「就是要留在 GCP 生態、不跨雲」。

**⚠️ Cloud Run 特有重點 — span flush（**必做**，接 001g）**：
- Cloud Run instance 會 **scale-to-zero / SIGTERM 回收**。用 **`BatchSpanProcessor`**（批次匯出）時，**未 flush 的尾端
  span 會在 instance 結束時遺失**。
- **必須**把 OTel SDK 的 `forceFlush()` + `shutdown()` 掛進既有 **graceful shutdown（[001g §5](./001g-routes-and-lifecycle.md)
  `lib/lifecycle.ts`）**，在 SIGTERM deadline（`SHUTDOWN_DEADLINE_MS`）內 flush 完再退出。
- dev / 短鏈路可用 `SimpleSpanProcessor`（即時匯出、無 flush 問題），prod 用 `BatchSpanProcessor` + 上述 flush。

---

## 8. log 整合（`src/lib/log.ts`）

- 結構化 log 每筆補 `traceId` / `spanId`（§4），與既有 `requestId` / `sessionId`（遮罩後）並存；有 Baggage 時加
  `enduser.id`。
- 三服務（BFF / 後端 / Streamlit）**統一欄位名**：`trace_id` / `span_id` / `session_id` / `request_id` / `enduser_id`，
  送同一 trace/log backend 才能跨服務 pivot。
- 遮罩沿用 001a（`maskSessionId` 等）；`traceId`/`spanId` **非機密**，明文輸出。

---

## 9. 其他服務必須遵守的契約（後端 / Streamlit）

| 服務 | 入站 | 出站 | log |
|---|---|---|---|
| 後端 | 續接 `traceparent` + `baggage`（同 trace / 同 session.id） | 對下游注入 `traceparent`+`baggage` | 印 `trace_id`/`span_id`/`session_id`/`request_id` |
| Streamlit | 讀 §5.3 的 `sessionId`/`trace_id`（query/cookie）當 root；服務間再用 `traceparent`/`baggage` | 對後端注入（OTel Python） | 印 `trace_id`/`session_id` |

- 三方 `serviceName`：`streamsight-bff` / `streamsight-backend` / `streamsight-streamlit`。
- **取樣比例三方一致**（§6）；皆送同一 collector / trace backend（§7）。

---

## 10. 安全 / 隱私

- `traceId` / `spanId` **不得含 PII**（純隨機 hex，天然滿足）。可安全放 log、錯誤回應、query、baggage。
- **嚴禁**把 `sessionId` 原值、access/refresh token、CSRF token 放進 **URL query / Baggage / tracestate**
  （query 會進瀏覽器歷史 / referrer / server log；baggage 會傳遍所有下游）。
- §5.3 / §5.4 若要傳 session 關聯，用 **sessionId 的不可逆衍生值**或**簽章短時效一次性 token**，不得可反推 session。
- Baggage 僅放 `session.id`（衍生）/ `enduser.id`（principal_id）；**不放** email、姓名、角色明細。

---

## 11. 實作順序（TDD）

1. **依賴**（§3）：加 `@vercel/otel` + `@opentelemetry/{api,sdk-logs,api-logs,instrumentation}`。
2. **traceId 模組**（§4）：`src/lib/observability/trace.ts` + 單元測試（有/無 active span、header 產出、Baggage、null 安全）。
3. **instrumentation**（§5.1/§6）：`register()` 內 `registerOTel({ serviceName, traceSampler })`；env 驅動取樣比例。
4. **span flush**（§7）：OTel `forceFlush`+`shutdown` 掛進 `lib/lifecycle.ts`（001g）的 SIGTERM 流程；prod 用 `BatchSpanProcessor`。
5. **log 欄位**（§8）：`log` 補 `traceId`/`spanId`/`enduser_id`；`createRoute` 帶入 log context + 設 Baggage（§5.2/§5.4）。
6. **backendFetch**（§5.1）：確認出站 `traceparent`+`baggage` 注入；未覆蓋處以 `outboundTraceHeaders()` 補；保留 `x-request-id`。
7. **錯誤回應**（§5.2）：envelope 增列 `traceId`。
8. **匯出**（§7）：選 (A) Collector 或 (B) Cloud Trace exporter；設 OTLP endpoint / GCP 憑證。
9. **Streamlit handoff**（§5.3）：登入成功導向 Streamlit 時帶 `sessionId` 衍生值（及選用 `trace_id`）；定義 URL 契約。
10. **驗證**：跨服務打一條 request，確認 BFF↔後端同 `traceId` + 同 `session.id`；換頁到 Streamlit 後由 `sessionId`/`trace_id` 可關聯；SIGTERM 不掉尾端 span。

每步先紅後綠。§9 涉及後端 / Streamlit 的部分為跨 repo 協調項。

---

## 12. 驗收清單

- [ ] `trace.ts`：`currentTraceId`/`currentSpanId` 有 active span 回 32-/16-hex、無則 `null`；`outboundTraceHeaders()` 產合法 `traceparent`；`setBaggage`/`baggageFieldsForLog` set→讀回；全數 null 安全。
- [ ] `instrumentation.ts` 以 `registerOTel({ serviceName='streamsight-bff', traceSampler })` 註冊；**不**在 `NEXT_RUNTIME` 守衛內；dev/prod 皆載入。
- [ ] 取樣：`ParentBased(TraceIdRatioBased)`，比例由 env 覆寫（prod 0.1）；三服務一致。
- [ ] **Cloud Run flush**：SIGTERM 時 OTel `forceFlush`+`shutdown` 在 deadline 內完成，尾端 span 不遺失。
- [ ] BFF 入站帶 `traceparent` → log `traceId` 與上游一致；無則開新 root。
- [ ] `backendFetch` 出站帶 `traceparent`+`baggage`；後端 log 出現**同一** `traceId` 與 `session.id`；`x-request-id` 仍保留。
- [ ] log 每筆含 `traceId`/`spanId`/`session_id`（遮罩）/`request_id`（有 session 時 `enduser_id`）。
- [ ] 對外錯誤回應含 `traceId`（不含任何 PII / token）。
- [ ] Baggage / query / tracestate **無** session 原值 / token；session 關聯僅用不可逆衍生值。
- [ ] 匯出：擇定 (A) Collector 或 (B) Cloud Trace，trace 在 backend 可見且跨三服務串接。
- [ ] 登入導向 Streamlit：URL 依 §5.3 契約帶 `sessionId` 衍生值（+選用 `trace_id`）；Streamlit 能關聯回使用者（跨 repo 驗證）。

---

最後更新：2026-07-18（v0.2，補：§5.4 Baggage、§6 取樣、§7 Cloud Run/GCP 匯出與 span flush、§1 RUM 範圍外定案、§3 精確依賴 + Next 專屬設定；核心決策經 Next 16 官方 doc 驗證）
