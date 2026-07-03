# Dassah — The Bible

> The single source of truth for how Dassah works, end to end: **natural language in → natural language out**, every component in between, the API surface, the known-brittle parts, and the feature map (shipped + potential).
>
> Dassah is a **conversational client for MarketX**. It is *not* a separate backend — it owns no commerce data. It translates human language ↔ MarketX API calls in both directions, using a Claude tool-use agent, and renders results as rich UI cards. Last updated 2026-06.

---

## 0. TL;DR — the whole loop in one breath

A seller types *"add US size 32 — 10 pcs to my Nike Air Max."* The browser sends it over a Socket.IO `chat:send`. The API server builds a system prompt + tool list + history and hands it to **Claude**, which decides to call the `store_management` tool with `{action:'set_stock', size:'US 32', stock:10, ...}`. The skill calls the **MarketX REST API**, **re-reads to verify the write actually landed**, and returns a structured result. The server turns that result into UI **metadata**, overrides the agent's prose if the action failed, and emits `chat:message`. The browser renders a verified **result card** plus the agent's text. NL → command → API → verify → NL.

---

## 1. System topology

Dassah is **two deployables** plus external services:

```
┌────────────────────────────┐         ┌──────────────────────────────┐
│  apps/ui  (Nuxt 3)         │  WS     │  apps/api  (Express + Socket.IO)
│  - chat UI + cards         │◀───────▶│  - chatWithAnthropic loop     │
│  - Nuxt server routes      │  HTTP   │  - skills registry (tools)    │
│    (proxies to MarketX)    │────┐    │  - guard / RAG / history      │
└────────────────────────────┘    │    └───────┬───────────┬──────────┘
                                   │            │           │
                 Bearer <MarketX JWT>           │           │
                                   ▼            ▼           ▼
                        ┌──────────────┐  ┌──────────┐ ┌──────────────┐
                        │  MarketX API │  │  Redis   │ │ Anthropic /  │
                        │ (commerce,   │  │ history, │ │ OpenAI       │
                        │  seller,     │  │ sessions │ │ (LLM + embed)│
                        │  media,      │  └──────────┘ └──────────────┘
                        │  embeddings) │
                        └──────────────┘
```

- **`apps/ui`** — Nuxt 3 app (the chat). Also hosts a few **server routes** (`/api/seller/stores`, `/api/orders/seller/*`, `/api/media/upload`) that proxy to MarketX to avoid CORS and to add the `/api` prefix + key. Deploys on **Vercel**.
- **`apps/api`** — Express HTTP + **Socket.IO** server. This is where the agent loop runs. Deploys as a long-running Node service (Railway-style).
- **MarketX API** — `https://marketx.indicestech.com`. The authority for *all* commerce data. Dassah is a guest with the user's token.
- **Redis** — conversation history (`history:<userId>`) and session store.
- **Anthropic** — the agent (`claude-sonnet-4-6` default). **OpenAI** — embeddings for RAG (and an alternate completion path).
- **Cloudinary** — image hosting, reached **through** MarketX's `/api/media/upload`.

> ⚠️ The **two deployments have separate env**. The buyer chat works through `apps/api` (which has `MARKETX_API_URL`/`MARKETX_API_KEY`); the seller store-picker works through `apps/ui` server routes (which need the **same env set independently**). This bit us repeatedly — see §11.

---

## 2. The request lifecycle — NL → NL (the centerpiece)

Every turn follows these steps. File references are exact.

### 2.1 Browser → wire
1. User types (or taps a chip / card button). Entry points:
   - Buyer: `InputBar.vue` → `@send` → `ChatWindow.vue` → `sendMessage(text, attachments)`
   - Seller: inline input in `layers/seller/pages/seller/chat.vue` → `handleSend()` → `sendMessage(text, attachments)`
2. `useChat.sendMessage(content, attachments)` (`layers/chat/composables/useChat.ts`):
   - Optimistically pushes the user message into `messages`.
   - Emits **`chat:send`** `{ content, sessionId, attachments? }` over the singleton socket (`useSocket.ts`).
3. Image attachments (if any) were already uploaded *before send* via the 📎 button → `POST /api/media/upload` (Nuxt proxy) → `{ url, public_id, type }`. See §10.

### 2.2 Server: socket → agent
4. `apps/api/src/index.ts` → `io.on('connection')` set up `socket.data.userId` (from the JWT in `socket.handshake.auth.token`), `socket.data.sessionType` (buyer/seller, via `session:type`), and `socket.data.storeId/storeSlug` (via `session:store`).
5. **`socket.on('chat:send', { content, attachments })`**:
   - `channel = socket.data.sessionType === 'seller' ? 'dassai-seller-web' : 'dassai-web'`
   - Calls `aiService.chat({ userId, content, channel, userToken, userAIConfig, storeId, storeSlug, attachments })`.

### 2.3 `aiService.chat` (`apps/api/src/services/ai.service.ts`)
6. **Input guard** — `sanitizeInput(userId, content)`. If blocked → safe canned reply, stop.
7. **User profile** — `userProfileService.getProfile(userId)` → `formatProfileForPrompt` (size, budget, style — for personalization).
8. **RAG** — `retrieveContext(content)`: embed the query via OpenAI, vector-search MarketX's `Embedding` table (pgvector), return a `[Relevant context from MarketX]` block. Scope: **PRODUCT, SELLER, SQUARE**. (See §6.)
9. **System prompt** — `buildSystemPrompt(channel, profileText, ragContext)` = `BUYER_BASE` **or** `SELLER_BASE` + profile + RAG.
10. **History** — `getHistory(userId)` from Redis; append the user message. If images attached, append a note (`[The user attached N image(s)…]`) so the model knows — **the URLs stay in `context`, the model never handles them**.
11. **Tools** — `loadSkills(channel, { userToken, storeId, storeSlug, attachments })` (`skills.registry.ts`). Seller mode loads **seller + buyer** skills; buyer mode loads buyer only. Context is **closed over** in each tool's `execute`.
12. **Model selection** — `userAIConfig` (BYOK) ?? platform default (`claude-sonnet-4-6`, `process.env.ANTHROPIC_API_KEY`).
13. Dispatch to **`chatWithAnthropic`** (default) or **`chatWithOpenAI`**.

### 2.4 The tool-use loop — `chatWithAnthropic` (NL ↔ command)
This is where natural language becomes commands and back. Loop up to **5 steps**:
```
for step in 0..5:
  response = anthropic.messages.create({ model, system, messages, tools })
  push assistant message
  if stop_reason != 'tool_use':           # model is done talking
     return { text, toolsInvoked, toolResults }
  for each tool_use block:
     checkToolInput(name, input)           # guard rail
     result = skill.execute(input)         # → registry wrapper → execute(input, context)
     toolResults[name] = result
     push tool_result block
  push the tool_results as a user turn
return ''                                  # ⚠️ loop exhaustion → empty (see §11)
```
- `tools` = each skill mapped to `{ name, description, input_schema: parameters }`.
- The model emits a `tool_use` block with a **JSON command**; the skill turns it into MarketX API calls; the **JSON result** goes back as a `tool_result`; the model reads it and writes the **NL reply**. That's the bidirectional translation.

### 2.5 Skill → MarketX → verify
14. A skill (`apps/api/skills/<name>/index.js`) uses `_lib.api()` to hit MarketX with `Authorization: Bearer <userToken>`. **Reads** return mapped data; **mutations** run through `verifiedMutation` (write → **re-read** → confirm) and return a structured `{ kind:'mutation', success, verified, change, error, display }`. (See §7.)

### 2.6 Server: result → metadata → wire
15. Back in `index.ts`: `buildMessageMetadata(toolsInvoked, toolResults, channel, content)` maps tool outputs into **UI metadata** (`meta.products`, `meta.actionResult`, …). (See §8.)
16. **Honesty override**: if `meta.actionResult.success === false`, the bot's text is **replaced** with the verified failure `display` — the agent literally cannot claim a success that didn't happen.
17. Emit **`chat:message`** `{ content, metadata }`.

### 2.7 Browser: render
18. `useChat` `chat:message` listener pushes the message; `MessageBubble.vue` renders `MarkdownText` (text → tappable chips) **plus** the relevant card(s) from metadata. (See §8.)

---

## 3. Component catalog

### 3.1 Frontend (`apps/ui` + `layers/`)
| Component | File | Role |
|---|---|---|
| `useChat` | `layers/chat/composables/useChat.ts` | message state, `sendMessage`, socket listeners (`chat:history/message/typing/error`), `loadConversation`, types (`ChatMessageMetadata`, `ActionResult`, `ActionPreview`, `StoreItem`, `SellerOrder`, `WalletInfo`) |
| `useSocket` | `layers/chat/composables/useSocket.ts` | **singleton** Socket.IO client; `connect(token, onConnected)` idempotent; `isConnected` |
| `useConversations` | `layers/chat/composables/useConversations.ts` | sidebar conversation list (client-side titles) |
| `ChatWindow` | `layers/chat/components/chat/ChatWindow.vue` | buyer chat shell; reloads history on mount/reconnect |
| seller chat page | `layers/seller/pages/seller/chat.vue` | seller shell, store switching, inline input + image upload |
| `InputBar` | `…/chat/InputBar.vue` | buyer input + 📎 upload + pending preview |
| `MessageBubble` | `…/chat/MessageBubble.vue` | renders text + all cards |
| `MarkdownText` | `…/chat/MarkdownText.vue` | minimal markdown; bullets → tappable chips (interactive bot msgs) |
| **Cards** | `…/chat/*.vue` | `ProductList`, `StoreCard`, `MarketCard`, `OrderList`, `WalletCard`, `AnalyticsCard`, `ConfirmActionCard`, `ActionResultCard`, `PaymentPrompt`, `QuickReplies` |

### 3.2 Transport — Socket.IO events
**Client → Server** (`ClientToServerEvents`, `apps/api/src/types/index.ts`):
| Event | Payload | Effect |
|---|---|---|
| `session:type` | `'buyer' \| 'seller'` | sets channel for the turn |
| `session:store` | `{ storeId, storeName, storeSlug }` | sets active store context for skills |
| `chat:send` | `{ content, sessionId, attachments? }` | runs a turn |
| `chat:new` | — | clears Redis history (new conversation) |
| `chat:load` | `{ sessionId }` | replays history (currently keyed by userId) |
| `payment:approve` | `{ approvalToken, sessionId }` | confirms a payment link |

**Server → Client**: `chat:history`, `chat:message`, `chat:typing`, `order:update`, `payment:prompt` (+ untyped `error`).

### 3.3 Backend services (`apps/api/src`)
| Module | Role |
|---|---|
| `index.ts` | Socket.IO server; connection/auth; all event handlers; `buildMessageMetadata`; `deriveQuickReplies`; `fetchUserAIConfig` |
| `services/ai.service.ts` | `aiService.chat`, `chatWithAnthropic`, `chatWithOpenAI`, prompts (`BUYER_BASE`/`SELLER_BASE`), `retrieveContext`, history helpers |
| `services/skills.registry.ts` | `loadSkills(channel, context)` — discovers skill dirs, hot-reloads per call, closes context over `execute` |
| `services/guard.service.ts` | `sanitizeInput` (prompt-injection), `scanOutput` (PII), `checkToolInput` (tool arg validation) |
| `services/embedding.service.ts` | `embedText` (OpenAI) |
| `services/user-profile.service.ts` | user prefs → prompt text |
| `services/session.ts` | Redis client, session store |
| `lib/internal.ts` | `internalClient.searchEmbeddings` (MarketX pgvector search) |

### 3.4 Skills (the tools)
A skill is `apps/api/skills/<name>/index.js` (CommonJS) exporting:
```js
module.exports = {
  channels: ['buyer'|'seller', …],   // who can use it
  description: '…',                   // the model reads this to decide when to call
  parameters: { type:'object', properties:{…}, required:[…] },  // JSON Schema
  async execute(inputs, context) { … }  // context = { userToken, storeId, storeSlug, attachments }
}
```
**Discovery:** `loadSkills` lists directories only (top-level files like `_lib.js` are ignored).

**Shared `_lib.js` helpers:** `api(path,{userToken,method,body})`, `authHeaders`, `resolveStore(context)` → `{slug,id}`, `kobo`/`naira`, **`verifiedMutation(...)`**, **`previewResult(...)`**, `BASE_URL`.

---

## 4. Skill reference (all 20)

> Money note: MarketX wallet/order amounts are **kobo** (÷100 for ₦) unless a field is documented NGN (`sellerBreakdown.net`). Skills convert at the edge with `kobo()`/`naira()`.
>
> **Discovery — embeddings vs raw query (read this before adding a search tool):** `semantic_search` is the *only* skill that hits the **vector index** (meaning-based; spans products/stores/markets). Every other search/detail skill below uses **raw ILIKE / attribute queries** over MarketX columns. Keep that line clean — see §6.

### Buyer / shared
| Skill | Channels | Actions / params | Exact endpoint(s) |
|---|---|---|---|
| `semantic_search` | buyer, seller | **vector** discovery across products+stores+markets (`query`,`type?`,`limit`) | `POST /api/ai/search {query,entityType?,limit}` (internal; embeds server-side → cosine). **The only embeddings read path.** |
| `marketx` | buyer, seller | **raw** keyword search: products **+ stores** (`query`,`limit`,`sellerId`) | `GET /api/commerce/products?search=&status=PUBLISHED&limit=&sellerId=` **+** `GET /api/search?q=&type=stores&limit=5` |
| `product_detail` | buyer, seller | full detail of one product — description, all variants/sizes+stock, categories, tags, rating, seller reputation (`slug`) | `GET /api/commerce/products/by-slug/{slug}` |
| `view_store` | buyer, seller | store profile + its products (`slug`/`storeId`,`limit`) | `GET /api/seller/by-slug/{slug}` **+** `GET /api/commerce/products?sellerId=&status=PUBLISHED&limit=` |
| `view_market` | buyer, seller | market/square profile + its products (`slug`,`limit`) | `GET /api/squares/{slug}` **+** `GET /api/commerce/products?squareSlug=&status=PUBLISHED&limit=` |
| `cart` | buyer | `view` / `add` / `remove` (`productId`,`variantId`,`quantity`) | `GET /api/commerce/cart`; `POST /api/commerce/cart` `{variantId,quantity}`; `DELETE /api/commerce/cart/{variantId}`. Auto-picks first in-stock variant on `add`; `409` = already in cart; amounts ÷100 |
| `deals` | buyer | discounted feed (`limit`,`offset`) | `GET /api/feed/deals?limit=&offset=` → `data[]` |
| `trending` | buyer | trending feed (`limit`) | `GET /api/feed/trending` → `data.trendingProducts[]` |
| `orders` | buyer | buyer's own orders / one (`orderId`,`limit`) | `GET /api/commerce/orders?limit=&offset=0` (list); `GET /api/commerce/orders/{id}` (detail). Uses `o.total`, `o.createdAt` |
| `tracker` | buyer, seller | shipment / order tracking (`trackingNumber`,`orderId`) | `GET /api/commerce/shipping/track/{trackingNumber}` **or** `GET /api/commerce/orders/{id}` (⚠️ order path is buyer-only) |
| `logistics` | buyer | shipping rate quotes (`origin`,`destination`,`weight_kg`) | **External, not MarketX**: GIG `POST {GIG_API_URL}/rates` + DHL (hardcoded stub). Silently `[]` if keys unset |
| `payment` | buyer | Paystack link + approval token (`productId`,`productName`,`price`,`currency`) | **External, not MarketX**: `POST https://api.paystack.co/transaction/initialize` (`PAYSTACK_SECRET_KEY`). ⚠️ Bypasses MarketX's own payment/order flow; see §11 |
| `dispute` | buyer | open dispute/refund (`order_id`,`reason`) | **Internal Dassah route**: `POST {DASSAH_API_URL}/api/orders/{id}/dispute` (`X-Internal-Key`) |
| `wallet` | buyer, seller | generic balance (+ tx) (`includeTransactions`) | `GET /api/commerce/wallet` (+ `…/wallet/transactions`). ⚠️ Returns **raw kobo, unconverted** (unlike `seller_wallet`) |

### Seller
| Skill | Actions | MarketX endpoints | Notes |
|---|---|---|---|
| `seller_analytics` | revenue/orders/units/views/impressions/trend/top-products | `GET /api/seller/analytics/{slug}?days=N` | **min 7 days** (clamped); `days` not `timeframe` |
| `store_management` | `list`, `create` (+image), `update_price`, `update_status`, `set_stock`, `archive`, `add_media` | `…/commerce/products`, `PATCH …/products/{id}` | mutations **verified + preview**; stock is **per-variant**, upsert-by-size; images via `mediaItems` |
| `seller_orders` | `list`, `get`, `update_status`, `ship` | `GET /api/commerce/orders/seller?storeSlug=`, `PATCH …/orders/{id}/status` | seller reads via the **list** (not `/orders/{id}` — that's buyer-only); status verified |
| `seller_wallet` | `balance`, `transactions`, `payout_preview`, `bank_accounts`, `withdraw` | `…/commerce/wallet/store/{slug}`, `…/wallet/withdraw`, `…/seller/bank-accounts` | withdraw **verified** (balance delta); amount sent in **kobo** |
| `store_profile` | `view`, `update`, `activate`, `deactivate` | `GET /api/seller/by-slug/{slug}`, `PATCH /api/seller/{id}`, `POST /api/seller/{id}/{activate\|deactivate}` | verified against the **write's returned row** (GET endpoints are inconsistent for these fields) |
| `social_media` | marketing campaigns | — | thin |

---

## 5. The agent contract (system prompts)

`BUYER_BASE` and `SELLER_BASE` (in `ai.service.ts`) are the behavioural spec. Highlights that the rest of the system depends on:

- **Buyer rule:** never invent products/prices — always use tools. Bullet lists become tappable chips. `productId: <v>` / `storeSlug: <v>` / `marketSlug: <v>` in a message → pass directly to the tool (deterministic, no re-search).
- **Buyer rule 3 + 19 (tool selection):** `semantic_search` is the default discovery tool (meaning-based, spans products/stores/markets); `marketx` only for exact titles / price filters; `product_detail`/`view_store`/`view_market` drill into one product/store/market.
- **Buyer rule 15–16:** if search finds no products but returns **stores**, recommend the store; use `view_store` (or the `storeSlug:` pattern) to show its products.
- **Buyer rule 17–18:** never claim a product "has no description/features" without calling `product_detail`; when a **market** is relevant, name it and offer `view_market`.
- **Seller rule 2 (preview-then-apply):** for any state/money change, call the tool with `preview:true` **first** (returns the real before→after as a `ConfirmActionCard`), wait for "yes", then call again to apply.
- **Seller rule 9 (no lying):** the agent **must not** state outcomes/numbers itself for mutations — it relays the tool's `display`. On failure it says it failed and relays the real `error`; it **never invents a cause**.

---

## 6. Retrieval — embeddings vs raw query (the two read paths)

MarketX data reaches Dassah two ways. **Keep them separate and know which you're using.**

### 6a. Embeddings (the vector index) — *meaning*
The vector index (MarketX `Embedding` table, pgvector, 1536-dim `text-embedding-3-small`) is written on every product/seller/square create/update by `entity-embedder.service.ts`, and read **exactly two ways**:

1. **Passive RAG hint — `retrieveContext(query)` (`ai.service.ts`).** Runs every buyer turn: `embedText(query)` → `internalClient.searchEmbeddings({vector, limit:8, threshold:0.45})` → formats `[PRODUCT]/[SELLER]/[SQUARE]` lines into a block appended to the **system prompt**. It's a *hint* the model may use to name-drop; it is **not** an actionable tool result (no cards).
2. **Active tool — `semantic_search` skill → MarketX `POST /api/ai/search`.** MarketX embeds the query server-side (shared `embedText` in `layers/ai/server/utils/openai-embedding.ts` — same model as the write path) and returns nearest products/stores/markets by cosine. This is what powers meaning-based discovery with real cards. **This is the only place the LLM can *act* on the vector index.**

**Embedded content + stored metadata (`entity-embedder.service.ts`):** the embedded *text* is rich (product title + description ≤400 + seller location + price + categories + tags + variants; seller/square description + location). The stored **metadata** (what search results carry back) is now enriched too — products include `description`(≤300), `condition`, `averageRating`/`totalReviews`, `categories`, `tags`, `imageUrl`, `inStockSizes`; sellers include store name/slug/location/verified; squares include name/slug/type/city/state. So a `semantic_search` hit is card-ready without a second fetch.

### 6b. Raw query (ILIKE / attributes / ids) — *exactness*
Everything else. `marketx` (products `?search=` + stores `/api/search` — both `ILIKE`), `product_detail` (`by-slug`), `view_store` (`by-slug` + `sellerId`), `view_market` (`/api/squares/{slug}` + `squareSlug`), plus all cart/order/wallet/seller skills. Use for exact titles, price/attribute filters, and id lookups. **These never touch embeddings.**

### Which tool when (mirrors buyer rules 3, 17–19)
- Open-ended / vibe / synonyms / "find me something…" → **`semantic_search`** (default discovery).
- Exact product title or price filter → **`marketx`**.
- "features / sizes / details of *this* product" → **`product_detail`**.
- A specific store or market → **`view_store`** / **`view_market`**.

> ⚠️ The passive RAG hint (6a.1) is injected into the **system prompt** = the prompt-cache prefix. Because it changes per query, it silently defeats caching. The fix (move RAG to the user turn) is the #1 cost item — see §11 / `AGENT_FINDINGS.md` A.1. The `semantic_search` tool (6a.2) does **not** have this problem — it runs as a normal tool call.
> ⚠️ `POST /api/ai/search` is internal (gated by `X-Dassah-Internal` = `MARKETX_API_KEY` on this side) and rate-limit-excluded on MarketX. Never expose it through the public gateway.

---

## 7. The trust / verification architecture (crown jewel)

The principle: **the LLM is a translator, never an authority.** Authority lives in the API + deterministic code. The agent proposes; the system executes and reports. This makes "lying" structurally impossible for mutations.

**`verifiedMutation({ action, target, change, execute, verify })`** (`_lib.js`):
1. `execute()` — performs the write (may throw; the real error is captured, never fabricated).
2. **Read-after-write** — `verify()` re-reads the source of truth and confirms the change landed. **HTTP 200 is not proof; the re-read is.**
3. Returns `{ kind:'mutation', success: verified, verified, target, change:{before,expected,actual}, error }`.

**`previewResult({ action, target, change })`** — a grounded before→after read **without** executing, for the confirmation step.

**Three layers of defence:**
1. **Authoritative card** — `ActionResultCard` renders from the verified `change`, not the agent's prose. The seller's eyes land on the truth.
2. **Prompt contract** — rule 9 forbids the agent from declaring outcomes.
3. **Deterministic override** — on `success:false`, the server replaces the message text with the verified failure `display`.

This layer has already caught real MarketX defects (stale `/api/profile` description, `activate` 500, buyer-only `/orders/{id}`) — each a "✅ done!" Dassah would otherwise have lied about.

---

## 8. Metadata → UI card mapping

`buildMessageMetadata` (`index.ts`) inspects `toolResults` and sets `meta.*`; `MessageBubble` renders accordingly.

| Tool result | `meta.*` | Card |
|---|---|---|
| `marketx.products` / `semantic_search.products` / `deals` / `trending` / `store_management` (list) | `products` (+ `isDeals`/`isTrending`/`sellerProducts`) | `ProductList` |
| `marketx.stores` / `semantic_search.stores` / `view_store.store` | `stores` | `StoreCard` (View products / Profile) |
| `semantic_search.markets` / `view_market.market` | `markets` | `MarketCard` (Browse → `marketSlug:` / Open) |
| `view_store.products` / `view_market.products` | `products` | `ProductList` |
| `cart` | `cart` / `cartUpdate` | inline cart confirmation |
| `orders` / `seller_orders.orders` | `orders` / `orderDetail` | `OrderList` |
| `wallet` / `seller_wallet` | `wallet` | `WalletCard` |
| `tracker` | `orderTracking` | tracking view |
| `seller_analytics` | `analytics` | `AnalyticsCard` (KPI grid + chart + top products) |
| any `{kind:'mutation'}` | `actionResult` | `ActionResultCard` (verified outcome) |
| any `{kind:'preview'}` | `actionPreview` | `ConfirmActionCard` (grounded confirm) |
| `payment` | `approvalToken`,`paymentUrl`,`productName`,… | `PaymentPrompt` |
| (derived) | `quickReplies` | `QuickReplies` |

**`deriveQuickReplies`** priority: inline bullets present → `[]` (MarkdownText already renders chips, avoid duplicates) → confirmation prompt → `['Yes, go ahead','No, cancel']` → tool/context defaults.

---

## 9. Auth & conventions

- **Auth:** the browser holds a **MarketX JWT**; it's sent as `socket.handshake.auth.token` and as `Authorization: Bearer` on Nuxt-proxy calls. Skills forward it to MarketX. MarketX JWT payload is **only** `{ userId, email, role }` — **no `sellerId`/store claims** (a recurring footgun; never gate on `user.sellerId`).
- **`X-API-Key`** is harmless legacy; MarketX authenticates the bearer.
- **Store context:** prefer `context.storeSlug`/`storeId` (set by `session:store`); else `resolveStore` falls back to `GET /api/profile` → the user's **default** store.
- **Money:** kobo → ₦ via `kobo()`/`naira()`. Analytics revenue units are as MarketX returns them.

---

## 10. Image upload pipeline

1. 📎 in `InputBar` / seller chat → file picker.
2. `POST /api/media/upload` (**Nuxt proxy**, `layers/core/server/api/media/upload.post.ts`) → forwards multipart to MarketX `POST /api/media/upload` (Cloudinary) with the bearer → returns `{ url, public_id, type }`.
3. Held as a pending attachment (thumbnail preview); sent on `chat:send` as `attachments`.
4. Server threads `attachments` → `aiService.chat` → `loadSkills` context.
5. `store_management.create` (and `add_media`) read `collectMedia(context)` → attach as `mediaItems:[{url,public_id,type}]` (MarketX requires all three; `public_id` is `@unique` so the **same** photo can't be added twice).

---

## 11. Known errors & brittle code (read before you trust anything)

**Cost / performance**
- **Prompt caching not implemented.** RAG sits in the system prompt → cache invalidator. At scale this dominates the bill. Fix: move RAG to the user turn + `cache_control` on the system/tools prefix (`AGENT_FINDINGS.md` A.1). Pair with **model tiering** (Haiku for routine, Opus for analytics).
- **No streaming.** `messages.create` is non-streaming; UI waits for the full reply.

**Agent loop**
- **Loop exhaustion → empty string.** After 5 tool steps `chatWithAnthropic` returns `''`. Needs a graceful fallback message.
- **OpenAI path renders no cards.** `chatWithOpenAI` returns `toolResults: {}` → metadata is empty → no product/order/etc. cards. Claude-only today.

**State / history**
- **One rolling history per user** (`history:<userId>`), shared across buyer/seller and across stores. `chat:load` ignores `sessionId`. The multi-conversation sidebar is cosmetic. Switching stores **clears** the chat to avoid cross-store bleed (no per-store memory yet).
- **`useChat.messages` is per-component-instance** while the socket is a singleton → listener ownership is fragile across navigation; history is re-requested on mount/reconnect as a workaround.

**Deploy / config**
- **UI vs API env split.** Seller Nuxt routes need `MARKETX_API_URL`/`MARKETX_API_KEY` on the **UI** deployment independently; missing → `"MarketX not configured"` masked by Nitro to `"Server Error"`.
- **`require()` in ESM.** Nitro bundles server code to `.mjs`; a bare `require('jsonwebtoken')` crashes at module load (fixed in `core/server/utils/auth.ts` — use `import`). Watch for new `require()` in server code.
- **Socket "Connecting…"** persists if `NUXT_PUBLIC_SOCKET_URL` isn't `wss://` or the host blocks WS upgrade.

**MarketX-side bugs surfaced by verification (file as MarketX tickets — not Dassah bugs):**
1. `/api/profile` returns **stale `null` `store_description`** after a successful PATCH (the PATCH's own row has the value).
2. `POST /api/seller/{id}/activate` → **500** for a fresh seller (deactivate works).
3. `/api/seller/by-slug/{slug}` **omits** `store_description` & `is_active` (public projection) — unusable for owner verification.
4. `GET /api/commerce/orders/{id}` is **buyer-only** ("Access denied" for the selling store) — sellers read via the seller list.

**Buyer-skill specifics (brittle / inconsistent)**
- **`payment` bypasses MarketX.** It calls **Paystack directly** (`transaction/initialize`), not MarketX's `…/commerce/payments/initialize`. So a paid Paystack transaction may **not create a MarketX order** through the normal flow — reconcile this with MarketX's real payment endpoints before relying on it.
- **`payment` email is always wrong.** It reads `context.email`, but the skill context is only `{ userToken, storeId, storeSlug, attachments }` — `email` is never populated, so it falls back to `customer@marketx.com` on every receipt. Thread the email through context (it's in the JWT) or fetch it.
- **`wallet` vs `seller_wallet` unit mismatch.** `wallet` returns **raw kobo** (`balance` unconverted); `seller_wallet` converts to ₦. The agent can misreport amounts by 100× depending on which it calls. Standardize on one convention.
- **`logistics` is mostly stub/external.** DHL is a hardcoded rate; GIG needs `GIG_API_URL`/`GIG_API_KEY`; both silently return `[]` if unset → "no shipping options."
- **`dispute` depends on an internal Dassah route.** It POSTs to `{DASSAH_API_URL}/api/orders/{id}/dispute` with `X-Internal-Key` — confirm that route actually exists in `apps/api` and the env is set, or disputes silently fail.

**Not yet live-proven**
- `seller_wallet.withdraw` — verify logic is conservative (an unconfirmable withdrawal reports **not done**, safe against double-withdraw) but never run against a funded wallet.
- `seller_orders.get` detail completeness depends on what the seller-list endpoint returns (address may be null).

**Legacy naming**
- "OpenClaw" types/strings are **dead** (`types/index.ts` `OpenClaw*`, comments). The real agent is the Claude tool-use loop. Don't be misled.

---

## 12. Feature map

### Shipped
**Buyer:** product search **+ store discovery**, view a store's products, cart add/view, deals, trending, order tracking, logistics, payment link + approval flow, disputes, RAG-grounded recommendations, personalized profile, tappable quick-replies.

**Seller:** analytics (verified KPI card + chart), full product management (list/create/update price/status/stock/archive/**add image**) with **grounded preview + read-after-write verification**, orders (list/get/confirm/ship, verified), wallet (balance/transactions/payout preview/bank accounts/withdraw, verified), store profile (view/update/activate/deactivate, verified), store switching with context reset, **image upload at create**, dual-mode (a seller can shop with buyer tools without leaving seller mode).

**Cross-cutting:** the **trust layer** (verified mutations, grounded confirmations, deterministic honest-failure), input/output guards, conversation history, rich card rendering instead of "dry chat".

### Potential / roadmap
- **Prompt caching + model tiering** (the big cost unlock).
- **Streaming** responses.
- **AI listing generation** from a photo (title/description/tags) — the seller-onboarding wedge.
- **Workstream 2 — AI customer service**: AI answers buyers *on the seller's behalf*, staged Assistive → Autopilot-within-policy → Proactive (see `AGENT_FINDINGS.md` §C).
- **Per-store conversation history** (replace the single rolling log).
- **OpenAI path card rendering** (populate `toolResults`).
- **Media management** beyond add: remove/reorder images, multi-image in one turn (UI already sends an array).
- **More seller tools**: affiliate/promoters, squares, social_media fleshed out.
- **New channels/verticals**: WhatsApp/voice; the engine is sector-agnostic (catalog is the only vertical-specific part) — see the horizontal positioning note.

---

## 13. File map (quick index)

```
apps/api/
  src/index.ts                      socket server, handlers, buildMessageMetadata, deriveQuickReplies
  src/services/ai.service.ts        chat(), chatWithAnthropic/ OpenAI, prompts, RAG, history
  src/services/skills.registry.ts   loadSkills()
  src/services/guard.service.ts     sanitizeInput / scanOutput / checkToolInput
  src/services/embedding.service.ts embedText
  src/lib/internal.ts               searchEmbeddings
  src/types/index.ts                socket event + message types (note: dead OpenClaw types)
  skills/_lib.js                    api, resolveStore, verifiedMutation, previewResult, kobo/naira
  skills/<name>/index.js            17 skills (§4)

layers/
  chat/composables/useChat.ts       message state, sendMessage, types
  chat/composables/useSocket.ts     singleton socket
  chat/components/chat/*.vue        MessageBubble + cards + InputBar + MarkdownText
  seller/pages/seller/chat.vue      seller shell, store switch, image upload
  core/server/api/media/upload.post.ts        media proxy
  seller/server/api/seller/stores.get.ts      store-picker proxy
  seller/server/api/orders/seller/*           seller dashboard proxies
  seller/server/utils/marketx.ts    fetchFromMarketX (adds /api once)
  core/server/utils/auth.ts         JWT verify (ESM import jwt)

docs/
  DASSAH_BIBLE.md                   (this file)
  AGENT_FINDINGS.md                 audit checklist, caching plan, cost model, MarketX bugs
  SELLER_TOOLS_SPEC.md              tool→endpoint map + status
```

---

*End — keep this current. When you add a skill, a card, or a socket event, update §3/§4/§8. When verification catches a MarketX bug, log it in §11.*
