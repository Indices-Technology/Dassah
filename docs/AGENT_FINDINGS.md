# Dassah Agent — Findings & Roadmap

> Living checklist from the agent audit (2026-06). Dassah is a **custom Claude
> tool-use agent** (Anthropic SDK + manual agentic loop in `apps/api/src/services/ai.service.ts`).
> "OpenClaw" is dead naming — the real tools load from `services/skills.registry.ts`;
> the `openclaw/skills/*.js` folder and the OpenClaw references in `ARCHITECTURE.md`/`CLAUDE.md`
> are legacy.

---

## A. Fixes & improvements (audit)

Ranked by value.

- [ ] **Prompt caching — the biggest cost/latency lever.** `chatWithAnthropic`
      re-sends system + tool schemas + growing history at full price every turn AND
      every loop step. At thousands of users this dominates the AI bill. Plan:
      - [ ] **Step 1 — move RAG out of the cached prefix (prerequisite).** Today
        `buildSystemPrompt` appends the per-query `[Relevant context from MarketX]`
        block into the **system prompt** — which is the cache *prefix*. Because RAG
        changes every query, it silently invalidates the cache on every turn. Move the
        RAG block into the **user turn** (prepend to the user message, or a separate
        `user`/system message after the breakpoint), leaving `BUYER_BASE`/`SELLER_BASE`
        stable. *This is the named A.1 invalidator.*
      - [ ] **Step 2 — make the system prompt itself stable.** No timestamps / per-user
        IDs in `BUYER_BASE`/`SELLER_BASE`. The user profile block is fairly stable per
        session — keep it, but after the base.
      - [ ] **Step 3 — add `cache_control: {type:'ephemeral'}`** to the **last system
        block** in `chatWithAnthropic` (render order is tools → system → messages, so a
        breakpoint on the last system block caches **tools + system** together — ~half
        the per-turn input). Tools are deterministic per channel, so they cache cleanly.
      - [ ] **Step 4 — multi-turn breakpoint.** Optionally add a breakpoint on the last
        content block of the latest turn so growing history is cached incrementally.
      - [ ] **Step 5 — verify.** Log `response.usage.cache_read_input_tokens`; if it's
        0 across identical-prefix turns, a silent invalidator remains (diff the rendered
        prompt). Economics: cache write ~1.25×, read ~0.1× → pays off from the 2nd turn.
      - Expected: ~90% off the cached prefix (~half the input) → roughly halves input cost.
- [ ] **Model tiering (pairs with caching).** Default is `claude-sonnet-4-6` for
      everything. Use **Haiku 4.5** ($1/$5, ~3× cheaper) for routine buyer chat, Sonnet
      for normal, **Opus 4.8** only for complex seller-analytics reasoning. Per-channel
      model selection in `aiService.chat`.
- [ ] **Verify real tools vs the live API (drift check).** Audit each tool in
      `skills.registry.ts` against `marketX/docs/openapi.json` shapes
      (`store_name` not `storeName`, `media` not `images`, `title` not `name`). The
      drift seen earlier was in the **dead** `openclaw/skills/` folder — confirm the
      *running* tools are correct.
- [ ] **Stream responses.** Currently non-streaming `messages.create`; Socket.IO is
      already in place. Stream tokens to the chat UI for perceived latency.
- [ ] **OpenAI path breaks product cards.** `chatWithOpenAI` returns
      `toolResults: {}` (ai.service.ts), but the UI builds cards from
      `toolResults['marketx']`. Populate `toolResults` on the OpenAI path, or document
      it as Claude-only.
- [ ] **Model default = `claude-sonnet-4-6`.** Valid + reasonable for buyer chat
      (cost/latency). Consider **Opus 4.8** for seller-analytics / complex reasoning
      paths; Sonnet/Haiku for routine buyer enquiries.
- [ ] **Loop exhaustion returns empty content.** After 5 steps `chatWithAnthropic`
      returns `''` — return a graceful fallback message instead.
- [ ] **Auth bridge (act AS the user).** Confirm the MarketX SSO/token path so tools
      hit the *user's own* data (the MarketX `auth.ts` / SSO item was unchecked).
      Required for real per-user seller management.
- [x] **Seller store-picker 404 (`/api/seller/stores`).** Two issues:
      (1) **stale Dassah deploy** — the route 404s on `dasah.indicestech.com`
      (MarketX `/api/seller/mine` is live = 401; Dassah `/api/seller/stores` = 404) →
      **redeploy Dassah**; (2) **fixed latent bug** — `fetchFromMarketX` did
      `${BASE}${path}` with no `/api` prefix (callers pass `/seller/mine`), now
      normalised to inject `/api` exactly once (`layers/seller/server/utils/marketx.ts`).
- [ ] **Refresh stale docs.** Rewrite `ARCHITECTURE.md` (ADR-001) + `CLAUDE.md` to
      describe the real Claude tool-use agent, not OpenClaw.

---

## B. Workstream 1 — Full seller management via chat ⭐

**Goal:** a seller manages their entire store by chatting — analytics, inventory,
orders, payouts, campaigns — everything the seller site does, rendered richly (not
"dry chat").

**Why it's very achievable:** Dassah consumes the same MarketX API. *Anything the
site can do, a tool can do* — it's wrapping endpoints as tools + a good system prompt
+ rich UI cards. The seller tool surface already exists partially
(`store_management`, `seller_analytics`, `social_media`).

- [ ] **Map the full seller API surface to tools** (one tool per capability):
      - [ ] Analytics — `/seller/analytics/{storeSlug}` (revenue, orders, units, views,
            impressions, time-series, per-product). *Already exists; wrap + render.*
      - [ ] Orders — list (`/commerce/orders/seller`), update status, mark shipped, tracking
      - [ ] Inventory/products — create (incl. **AI listing generation**), edit, archive, variants/stock
      - [ ] Wallet & payouts — balance, transactions, withdraw, bank accounts
      - [ ] Store profile — edit, activate/deactivate, store wall + shoutouts
      - [ ] Affiliate — promoters, referrals
      - [ ] Squares — membership, announcements
- [ ] **Rich rendering** — extend the "UI renders cards, not markdown" pattern to
      **analytics dashboards / charts / order cards / inventory tables** in chat. The
      chat becomes a conversational dashboard.
- [ ] **Seller-scoped auth** — tools act as the logged-in seller (Workstream A auth bridge).
- [ ] **Action confirmation** — reuse the explicit-approval pattern for mutating
      actions (price changes, payouts, status updates).

> This is the **differentiator**: "run your whole shop by chatting." Bounded, mechanical
> work (wrap endpoints) — high payoff.

---

## C. Workstream 2 — AI-assisted customer interactions (seller's rep) ⭐⭐

**Goal:** when a buyer enquires or follows up, the AI answers *on the seller's behalf* —
intelligently, humanely, like a great sales/CS rep.

**Verdict: not a dream — very possible.** Same tool-use + RAG pattern; MarketX already
has buyer↔store chat (conversations + Pusher/Soketi) for the AI to sit in. **But it is
a distinct, more ambitious product with a real trust/autonomy design at its core** — so
it ships in stages, not all at once.

**The hard parts (design, not feasibility):**
- [ ] **Autonomy boundary** — what the AI may promise *autonomously* (stock, specs,
      shipping cost, order status — all tool-grounded) vs. what needs the seller
      (discounts, custom deals, delivery-date promises). Seller-set policy.
- [ ] **Tone / brand** — per-seller persona (voice, FAQs, policies) so it's humane, not robotic.
- [ ] **Escalation / human-in-the-loop** — the AI hands off when out of policy
      (negotiation, complaints, anything risky). Knowing its limits is the feature.
- [ ] **Tool-grounding** — never invent stock/price/shipping (the buyer system prompt
      already enforces this — extend it).
- [ ] **Cost at scale** — auto-replying to every buyer message is real LLM spend;
      Haiku/Sonnet for routine, escalate to Opus for complex; prompt caching essential.

**Staged path (ship trust before autonomy):**
- [ ] **Stage 1 — Assistive (suggest):** AI *drafts* a reply in the seller's inbox;
      seller taps Send. Low risk, builds trust, immediately useful.
- [ ] **Stage 2 — Autopilot within policy:** AI auto-replies to in-policy enquiries
      (stock, status, specs); escalates the rest. Seller toggles autopilot per store.
- [ ] **Stage 3 — Proactive:** follow-ups ("your item is back in stock"), abandoned-cart
      nudges, post-delivery check-ins.

> **Strategic value:** this is the killer feature for the informal-commerce thesis —
> it lets a one-person WhatsApp seller scale customer service without hiring. That's a
> concrete *reason a seller moves onto MarketX*, strengthening the seller-side cold-start wedge.

---

## D. Reference — cost model & embedding scope (settled 2026-06)

**Embedding scope (RAG):**
- Index covers **PRODUCT, SELLER, SQUARE** only (MarketX `entity-embedder.service.ts`
  has `embedProduct`/`embedSeller`/`embedSquare`; nothing else is embedded).
- **Descriptions + seller locations are already embedded** — `buildProductText`
  includes the description (≤400 chars) + seller name/location/city/state + categories
  + tags + condition + sizes/stock; `buildSellerText` includes store description +
  location + POD zones. Dassah's `retrieveContext` only *displays* `title`, but
  *matching* uses the full text. The 400-char cap is the one tunable.
- **A vector is always 1536 floats (~6 KB) regardless of input text length.** Embedding
  more text = better quality at **~zero extra DB storage**. Storage grows with **entity
  count** (new types), not text length.
- **No separate vector DB needed** — pgvector in the (Supabase) Postgres handles into
  the millions with an HNSW index. Revisit only if vector query load contends with OLTP.
- **Cost of widening:** embedding generation ≈ $0.02/1M tokens, re-embedded only on
  change (SHA-256 skip) → ~$0.60 for 100k products, one-time. Query embeddings ≈ pennies.
  Storage ≈ ~10–12 KB/entity. Embeddings are *not* where the AI bill lives.

**Chat-completion pricing (where the bill lives):**
- **Billed centrally to the platform's API key, per-token** (`apiKey =
  userAIConfig?.apiKey ?? process.env.ANTHROPIC_API_KEY`). BYOK path exists
  (`userAIConfig.apiKey`) to offload cost to heavy users.
- No per-seat licensing; concurrency hits **rate limits (TPM/RPM)**, not unit price.
- Scale math: tool loop re-sends context every step → ~10–20k input tokens/turn.
  Sonnet 4.6 ≈ $0.04/turn → 10k users × 20 turns/day ≈ ~$240k/mo **before** caching.
  Caching + Haiku-for-routine → est. ~$30–60k/mo. → makes A.1 (caching) + model
  tiering the critical levers.

## Open questions to settle
- Which model per path (buyer routine vs. seller analytics vs. CS autopilot)?
- Where does the seller persona/policy config live (MarketX `SellerProfile` vs. Dassah)?
- Auth: how does a MarketX session become a Dassah userToken the tools use?
