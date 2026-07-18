# Spec 001h：BFF 基礎建設 — 分散式追蹤（traceId 模組）

- **狀態**：Draft **v0.3**（2026-07-18）— **階段 A（server-side）達「可實作」；階段 B（Streamlit handoff）延後**
- **建立日期**：2026-07-18
- **影響範圍**：`src/lib/observability/trace.ts`（新）、`src/instrumentation.ts` + `src/instrumentation.node.ts`（新）、
  `src/lib/lifecycle.ts`（span flush）、`src/lib/api/backend.ts`、`src/lib/api/create-route.ts`、
  `src/lib/api/request-id.ts`、`src/lib/log.ts`
- **依賴**：
  - [001a foundations](./001a-foundations.md)（`env`、`log`、constants）
  - [001e backendFetch](./001e-backend-fetch.md)（出站注入點；現有 `x-request-id`）
  - [001f createRoute](./001f-create-route.md)（入站 id 產生點）
  - [001g routes-and-lifecycle](./001g-routes-and-lifecycle.md)（`instrumentation.ts` 註冊點 + graceful shutdown，§7 flush 相依）
  - 外部標準 **W3C Trace Context**（`traceparent`）、**W3C Baggage**（`baggage`）、**OpenTelemetry**（JS + Python）
  - Next.js 官方 OTel 指引（`node_modules/next/dist/docs/01-app/02-guides/open-telemetry.md`，2026-07-18 已讀，本檔對齊）
- **下游 / 相關服務（非本 repo）**：Streamlit 前端、真後端——皆須遵循 §9 傳遞契約
- **部署目標**：**GCP Cloud Run**（多 instance、scale-to-zero、SIGTERM graceful shutdown）——影響取樣（§6）與 flush（§7）
- **總覽**：見 [001 index](./001-bff-infrastructure.md)

> **v0.3 變更（收掉 v0.2 的實作阻礙）**：
> 1. **Baggage 改由 `backendFetch` 直接從 `session` 組 header**（不走 OTel baggage-context；原 `setBaggage(): void` 傳不出去，已移除）。§4/§5.1/§5.4。
> 2. **改用手動 `NodeSDK`**（非 `@vercel/otel`）：本專案路由**全 node runtime、無 edge**，且 §7 Cloud Run flush 需要
>    `sdk.forceFlush()`/`shutdown()` 的 handle——`NodeSDK` 直接給、`@vercel/otel` 藏在內部。§3/§5.1/§7。
> 3. **Streamlit handoff（§5.3）延後**（blocked on 認證 handoff spec）。**本期登入成功導向 CMS admin 管理區（`/cms`）**。
>
> 核心決策（W3C Trace Context、不自訂 header、瀏覽器換頁不靠 header）維持不變，且經 Next 16 官方 doc 驗證。

---

## 1. 目的與範圍

**目的**：讓「一次邏輯操作」在 Next.js BFF、後端、Streamlit 之間可被關聯追蹤，且與業界工具
（OpenTelemetry / Jaeger / Tempo / Cloud Trace / Datadog）相容。

**範圍內（階段 A，本期）**
- `traceId` 模組（`src/lib/observability/trace.ts`）：讀 active span、組出站 headers。
- 入站：`NodeSDK` 自動從 request 的 `traceparent` 續接（有則同 trace、無則開新 root）。
- 出站（服務對服務）：`backendFetch` **手動注入** `traceparent` + `baggage`（§5.1）。
- 取樣（§6）、匯出 / Cloud Run flush（§7）、log 整合（§8）、錯誤回應加 `traceId`（§5.2）。

**範圍外 / 延後**
- **階段 B：Streamlit handoff（§5.3）**——延後至「認證 handoff spec」定案。本期登入成功導向 **`/cms`**（見 §5.3）。
- **完整瀏覽器 RUM（本期不做）**：OTel browser SDK（page-load span、Web Vitals、client error、從點擊起 trace）。
  理由：CMS 為內部 admin 工具、流量低，server-side trace 已夠；完整 RUM 的 bundle / 對外 ingest（CORS、公開端點、
  濫用防護）/ 隱私（同意機制）成本高、ROI 低。**列為未來**，且屆時優先評估 Streamlit（若為真實 end-user 產品）。
  - **中間路線（未來優先於完整 RUM）**：只在 CMS SPA **對自家 BFF 的 same-origin fetch** 注入 `traceparent`（同源
    fetch **可**設 header，與 §5.3 top-level 換頁不同），讓 trace「從使用者動作」起算而不需 browser SDK。
- 各服務內部細粒度 span 佈建、Streamlit / 後端內部實作（僅 §9 定契約）、認證 handoff 本身、metrics。

---

## 2. 名詞：三種 id，別混用

| id | 範圍 | 現況 | 用途 |
|---|---|---|---|
| `requestId` | **單一 request 的一跳** | 已有（`x-request-id`） | 人類友善 log key；一次 BFF→後端呼叫鏈 |
| `traceId`（+`spanId`） | **一次操作跨多服務**的整條 trace | 本檔新增 | 分散式追蹤；串各服務 span 成樹 |
| `sessionId` | **使用者旅程**，跨多 request / 服務 | 已有（iron-session） | 關聯「登入」與後續（含 Streamlit）活動 |

> 準則：「一次操作跨服務」→ `traceId`；「使用者旅程」→ `sessionId`（經 Baggage 的衍生值傳，§5.4）。
> `requestId` 保留為每一跳的 log key，不取代 `traceId`（一條 trace 可含多個 requestId）。

---

## 3. 選型與依賴：手動 `NodeSDK`（node-only + 需 flush）

- **W3C Trace Context（`traceparent`）+ OpenTelemetry**，不自訂 `X-Trace-Id`。Next 16 已**內建自動 instrument**
  （root span `GET /pathname` + 巢狀 span），span 送往全域註冊的 TracerProvider。
- **為何手動 `NodeSDK` 而非 `@vercel/otel`**（v0.3 決策）：
  - 本專案路由**全 node runtime、未用 edge**——`@vercel/otel` 唯一的差異化優勢（edge 支援）在此**用不到**。
  - §7 的 Cloud Run flush **必須**拿到 provider 呼叫 `forceFlush()`/`shutdown()`；**`NodeSDK` 直接提供**，
    `@vercel/otel` 把 provider 藏在內部、不易取得 flush handle。
  - 官方 doc 明載手動 `NodeSDK`「等價於 `@vercel/otel`，但能改／擴充 `@vercel/otel` 未暴露的功能」。
  - > 若未來引入 edge runtime，再評估切回 `@vercel/otel`（屆時 flush 策略需另解）。
- **依賴清單（精確；對齊 Next doc 手動路徑）**：
  ```
  @opentelemetry/sdk-node
  @opentelemetry/sdk-trace-node          # BatchSpanProcessor / SimpleSpanProcessor
  @opentelemetry/exporter-trace-otlp-http # OTLP exporter（§7-A）
  @opentelemetry/resources
  @opentelemetry/semantic-conventions
  @opentelemetry/api                      # trace 模組讀 active span（§4）
  ```
  - 若未來改 §7-B（Cloud Trace）：另加 `@google-cloud/opentelemetry-cloud-trace-exporter`。
- **Next 專屬**：`NEXT_OTEL_VERBOSE=1` 看更多 Next 內部 span。

---

## 4. `traceId` 模組（`src/lib/observability/trace.ts`，新）

薄封裝 `@opentelemetry/api`，讓業務碼不直接相依 OTel。**server-only**。**不管理 span 生命週期**（span 由 Next 自動開）。

```ts
export function currentTraceId(): string | null   // 32-hex；無 active span → null
export function currentSpanId(): string | null    // 16-hex
export function traceFieldsForLog(): { traceId: string | null; spanId: string | null } // null 安全

/** 出站 traceparent：從 active span context 以 W3C 格式組出；無 active span → {}。 */
export function outboundTraceHeaders(): { traceparent?: string }

/** sessionId 的不可逆衍生（如 sha256 → 16 hex）；同一 sessionId 穩定、無法反推。 */
export function deriveSessionCorrelationId(sessionId: string): string

/** 出站 baggage：從 session 直組（非 OTel baggage-context）；無 session → {}。 */
export function outboundBaggageHeaders(
  session: { userId: string } | null,
  sessionId: string | null,
): { baggage?: string } // "session.id=<derived>,enduser.id=<userId>"
```

- **為何 baggage 用「直組 header」而非 OTel baggage-context**（v0.3）：OTel Baggage 綁在 context 上，需
  `context.with(setBaggage(active(), …), fn)` 才傳得出去；`backendFetch` **已握有 `options.session`**，直接組
  `baggage` header 更簡單、確定、可測，且免動 request 的 async context 範圍。
- **無 active span / 無 session 時**：對應函式回 `null` / `{}`，**不得 throw**。
- **強制 TDD**：有/無 active span 的回傳；`outboundTraceHeaders` 產合法 `traceparent`；`deriveSessionCorrelationId`
  穩定且不等於原值；`outboundBaggageHeaders` 值正確且 null 安全。

---

## 5. 傳遞路徑

### 5.1 服務對服務（`backendFetch` 手動注入）

- **入站**：`NodeSDK` 的 http instrumentation 自動從 request `traceparent` 續接（有則同 trace、無則開新 root）；
  Next 的 request span 成為 active span。
- **出站**：`backendFetch` 在組 headers 時**併入** `outboundTraceHeaders()` + `outboundBaggageHeaders(session, sessionId)`
  （來自 §4），**與既有 `x-request-id` 並存**。
  > 採手動注入（而非依賴 fetch auto-instrumentation 自動注入）→ 傳遞**確定**、可單元測試，不受 Next patch fetch 的行為變動影響。
- 後端須「續接 `traceparent`+`baggage` 並回報同一 `traceId`/`session.id`」（§9）。

### 5.2 入站 id 關聯（`createRoute`）

- `createRoute` 產生 `requestId`（不變）**並**讀 `traceFieldsForLog()`，把 `traceId`/`spanId` 帶進該 request 的
  log context；有 session 時 log 額外記 `enduser_id`（= `session.userId`，BFF 本就有，不需從 baggage 反讀）。
- 對外**錯誤回應**：維持 `{ error: { code, message, requestId } }`，**增列 `traceId`**（非 PII，§10）方便回報查詢。

### 5.3 登入後導向（本期：CMS admin 管理區；Streamlit handoff 延後）

- **本期定案**：登入成功導向 **`/cms`**（CMS admin 管理區進入點；現況 `LoginCard` 已 `router.push('/cms')`，**無需改 code**）。
  - 為何是 `/cms` 而非 `/cms/admins`：`/cms/admins` 為 **SUPER_ADMIN gated**（[013a §2](./013a-admin-management-logic.md)），
    editor/viewer 會被導回；`/cms` 是**所有 admin 的通用落點**，super_admin 於其中見「管理員管理」入口。
- **階段 B（延後）— Streamlit handoff**：待「認證 handoff spec」定案後實作。屆時契約：瀏覽器 top-level 導航
  **傳不動 header**（`traceparent`/`baggage` 失效、天生開新 trace），故關聯靠——
  1. **`sessionId` 衍生值（主）**：handoff 帶 `deriveSessionCorrelationId(sessionId)`（非原值），兩邊 log 都記；
  2. **query `?trace_id=<32hex>`（選用）**：Streamlit 以 `st.query_params` 讀，當該 session root；
  3. 共用 cookie（同上層網域時）。
  - **嚴禁**把 session token / 憑證放 query（§10）。

### 5.4 Baggage：跨服務傳 `session.id` / `enduser.id`

- 服務對服務（BFF→後端）以 **`baggage` header** 傳跨切 context，由 §4 `outboundBaggageHeaders()` 在 `backendFetch` 組出。
- 鍵名對齊 OTel semantic conventions：**`session.id`**（= `deriveSessionCorrelationId(sessionId)`，衍生值）、
  **`enduser.id`**（= `session.userId` = principal_id，已 opaque）。
- **僅非機密**：不得含 email / 姓名 / raw sessionId / token（§10）。後端 / Streamlit 讀進各自 log。

---

## 6. 取樣策略（Sampling）

- **Sampler = `ParentBased(root = TraceIdRatioBased(ratio))`**：尊重上游決定；只有 root 依比例。
- **比例（定案·env 覆寫）**：dev/test = **1.0**；staging = **0.5**；**prod = 0.1**。
  標準 env：`OTEL_TRACES_SAMPLER=parentbased_traceidratio`、`OTEL_TRACES_SAMPLER_ARG=<ratio>`；或 `NodeSDK({ sampler })`。
  **三服務比例一致**，否則 trace 會斷。
- **錯誤 / 慢請求不漏**（定案：先 (a)，有 Collector 時加 (b)）：
  - (a) **錯誤 log 一律帶 `traceId`**（§5.2）→ 未取樣仍可由 log 反查；
  - (b) Collector **tail-based sampling**：對含錯誤 / 高延遲的 trace 取 100%（§7-A）。

---

## 7. 匯出與部署（Cloud Run）

**定案（2026-07-18）：本期走 (A) OTel Collector（OTLP）；(B) Cloud Trace 暫不採用但保留。**

- **(A) OTel Collector（OTLP，供應商中立，✅ 本期採用）**：Cloud Run app →（`OTLPTraceExporter`）→
  **Collector（獨立 Cloud Run service 或 sidecar）** → trace backend（Tempo / Jaeger / Datadog…）。Collector 可做
  §6(b) tail sampling、批次、重試。
  - **彈性如何體現**：app 只認 OTLP，trace backend 藏在 Collector 之後——換後端、或**加 Cloud Trace exporter**（含多送）
    只改 **Collector config、零 app code 變更**。
- **(B) GCP Cloud Trace 直匯（⏸ 未採用）**：`@google-cloud/opentelemetry-cloud-trace-exporter` 直送，免 Collector，
  但 app 直綁 GCP。保留為未來（建議屆時在 Collector 端多接，而非讓 app 直綁）。

**⚠️ Cloud Run span flush（必做，接 001g）**：
- prod 用 **`BatchSpanProcessor`**（批次匯出）；scale-to-zero / SIGTERM 時**未 flush 的尾端 span 會遺失**。
- **必須**把 `sdk.forceFlush()` +（退出前）`sdk.shutdown()` 掛進既有 **graceful shutdown（[001g §5](./001g-routes-and-lifecycle.md)
  `lib/lifecycle.ts`）**，在 `SHUTDOWN_DEADLINE_MS` 內完成。**`NodeSDK` 直接暴露這兩個方法**（§3 選它的原因之一）。
- dev / 短鏈路用 `SimpleSpanProcessor`（即時匯出、無 flush 問題）。

---

## 8. log 整合（`src/lib/log.ts`）

- 結構化 log 每筆補 `traceId` / `spanId`（§4），與既有 `requestId` / `sessionId`（遮罩）並存；有 session 時加 `enduser_id`。
  - **實作方式**：log 模組 emit 時**自動讀** `traceFieldsForLog()`（呼叫端不需逐一帶），與 requestId 一致風格。
- 三服務**統一欄位名**：`trace_id` / `span_id` / `session_id` / `request_id` / `enduser_id`。
- 遮罩沿用 001a；`traceId`/`spanId` 非機密，明文。

---

## 9. 其他服務必守契約（後端 / Streamlit）

| 服務 | 入站 | 出站 | log |
|---|---|---|---|
| 後端 | 續接 `traceparent`+`baggage`（同 trace / 同 `session.id`） | 對下游注入 `traceparent`+`baggage` | `trace_id`/`span_id`/`session_id`/`request_id` |
| Streamlit（階段 B） | 讀 §5.3 的 `sessionId` 衍生值 / `trace_id` 當 root；服務間再用 `traceparent`/`baggage` | 對後端注入（OTel Python） | `trace_id`/`session_id` |

- `serviceName`：`streamsight-bff` / `streamsight-backend` / `streamsight-streamlit`。
- **取樣比例三方一致**（§6）；皆送同一 collector / backend（§7）。

---

## 10. 安全 / 隱私

- `traceId` / `spanId` **不含 PII**（純隨機 hex）。可安全放 log、錯誤回應、query、baggage。
- **嚴禁**把 `sessionId` 原值、access/refresh token、CSRF token 放進 **URL query / Baggage / tracestate**。
- session 關聯一律用 **`deriveSessionCorrelationId()` 的不可逆衍生值**（或簽章短時效一次性 token），不得可反推。
- Baggage 僅放 `session.id`（衍生）/ `enduser.id`（principal_id）；不放 email / 姓名 / 角色明細。

---

## 11. 實作順序（TDD）

**階段 A（本期，可實作）**
1. **依賴**（§3）：加 `@opentelemetry/{sdk-node,sdk-trace-node,exporter-trace-otlp-http,resources,semantic-conventions,api}`。
2. **traceId 模組**（§4）：`src/lib/observability/trace.ts` + 單元測試（active span 有/無、`traceparent` 產出、
   `deriveSessionCorrelationId` 穩定不可逆、`outboundBaggageHeaders` 值 + null 安全）。
3. **instrumentation**（§5.1/§6/§7）：`instrumentation.ts` 於 `NEXT_RUNTIME==='nodejs'` 時 import `instrumentation.node.ts`
   → `new NodeSDK({ resource(serviceName), sampler: ParentBased(TraceIdRatioBased), spanProcessor })`（prod Batch / dev Simple）
   `.start()`；env 驅動取樣比例與 OTLP endpoint。
4. **span flush**（§7）：把 `sdk.forceFlush()`/`shutdown()` 掛進 `lib/lifecycle.ts`（001g）SIGTERM 流程。
5. **log 欄位**（§8）：`log` emit 時自動帶 `traceId`/`spanId`/`enduser_id`。
6. **backendFetch**（§5.1）：出站 headers 併入 `outboundTraceHeaders()` + `outboundBaggageHeaders(session, sessionId)`；
   保留 `x-request-id`。單元測試斷言 header 內容。
7. **錯誤回應**（§5.2）：envelope 增列 `traceId`。
8. **驗證**：跨服務打一條 request → BFF↔後端同 `traceId` + 同 `session.id`；SIGTERM 不掉尾端 span。

**階段 B（延後，blocked on 認證 handoff spec）**
9. Streamlit handoff（§5.3）：登入導向 Streamlit 時帶 `deriveSessionCorrelationId(sessionId)`（+選用 `trace_id`）；定 URL 契約。
   （**本期登入維持導向 `/cms`，不動。**）

每步先紅後綠。§9 涉及後端 / Streamlit 為跨 repo 協調項。

---

## 12. 驗收清單

**階段 A**
- [ ] `trace.ts`：`currentTraceId`/`currentSpanId` 有 active span 回 32-/16-hex、無則 `null`；`outboundTraceHeaders()` 產合法 `traceparent`；`deriveSessionCorrelationId` 穩定且 ≠ 原值；`outboundBaggageHeaders` 值正確；全數 null 安全。
- [ ] `instrumentation.node.ts` 以 `NodeSDK`（`serviceName='streamsight-bff'`、`ParentBased(TraceIdRatioBased)` sampler）啟動；於 `instrumentation.ts` 的 `NEXT_RUNTIME==='nodejs'` 分支載入；dev/prod 皆生效。
- [ ] 取樣比例由 env 覆寫（prod 0.1）；三服務一致。
- [ ] **Cloud Run flush**：SIGTERM 時 `sdk.forceFlush()`+`shutdown()` 在 deadline 內完成，尾端 span 不遺失。
- [ ] BFF 入站帶 `traceparent` → log `traceId` 與上游一致；無則開新 root。
- [ ] `backendFetch` 出站帶 `traceparent`+`baggage`（`session.id` 衍生 + `enduser.id`）；後端 log 同一 `traceId`/`session.id`；`x-request-id` 仍在。
- [ ] log 每筆含 `traceId`/`spanId`/`session_id`（遮罩）/`request_id`（有 session 時 `enduser_id`）。
- [ ] 對外錯誤回應含 `traceId`（不含任何 PII / token）。
- [ ] Baggage / query / tracestate **無** session 原值 / token。
- [ ] 匯出：OTLP → Collector，trace 在 backend 可見且跨服務串接。
- [ ] **登入成功導向 `/cms`**（admin 管理區；非 Streamlit）。

**階段 B（延後）**
- [ ] Streamlit handoff：URL 依 §5.3 帶 `sessionId` 衍生值（+選用 `trace_id`）；Streamlit 能關聯回使用者（跨 repo）。

---

最後更新：2026-07-18（v0.3，收掉實作阻礙：baggage 改 backendFetch 直組、改用手動 NodeSDK（拿得到 flush handle）、Streamlit handoff 延後且本期登入導向 `/cms`；階段 A 達可實作）
