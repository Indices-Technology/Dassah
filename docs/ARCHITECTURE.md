# DassaAI — Architecture Decisions

> **⚠ Status (2026-07-13):** This log predates the current architecture. The engine
> is **no longer OpenClaw** — it is a custom tool loop in `apps/api/src/services/ai.service.ts`.
> ADR-001 and ADR-007 below are **superseded** (kept for history, annotated inline).
> For where the project is headed, read **[DASAH_PLAN.md](DASAH_PLAN.md)** — that is the
> plan of record. ADRs are immutable records; add new ones, don't rewrite old ones.

## Decision Log

Every significant architectural choice is recorded here with its rationale.
When in doubt about why something is structured a certain way, check this file first.

---

### ADR-001: OpenClaw as Agent Engine — **SUPERSEDED**

> **Superseded by the custom engine (see ADR-008).** OpenClaw was removed. The
> `openclaw.ts` client and OpenClaw-format skills are deleted. The reasons below are
> retained only as historical context.

**Original decision:** Use OpenClaw as the AI agent gateway rather than building a custom agent loop.

**Original rationale:**
- OpenClaw provides a mature skill system (plug-and-play integrations)
- Self-hosted: all user data stays on our infrastructure
- Supports Claude, GPT, DeepSeek, and local Ollama — LLM is swappable
- Connects to messaging platforms (WhatsApp, Telegram) as optional future channels

**Why it was dropped:**
- OpenClaw governance went into flux (founder joined OpenAI, Feb 2026)
- We needed a custom payment-approval UX and card-rendering contract the gateway fought
- A ~250-line in-house loop (`ai.service.ts`) gave us full control, native tool-calling,
  and per-user LLM choice with far less operational surface than a self-hosted gateway

---

### ADR-008: Custom Agent Loop (replaces ADR-001)

**Decision:** The agent engine is a custom loop in `apps/api/src/services/ai.service.ts`
that calls the Anthropic and OpenAI SDKs directly.

**Rationale:**
- Native tool-calling on both providers; LLM is swappable per user (`UserAIConfig`)
- Tools are plain JS modules auto-discovered by `skills.registry.ts` — no manifest format
- Full ownership of the turn: guard rails, RAG context injection, per-user memory,
  and read-after-write verification (`_lib.verifiedMutation`) all live in our code
- One less self-hosted service to run than the OpenClaw gateway

**Trade-offs:**
- We own the loop's correctness (step cap, tool-error handling) — covered in `ai.service.ts`
- Multi-step planning is the model's native tool loop (max 5 steps), not a dedicated
  planner. A real planner is deferred until a workflow needs it (see DASAH_PLAN.md).

---

### ADR-002: Centralised Multi-Tenant Instance

**Decision:** One OpenClaw instance on our server, serving all users.

**Rationale:**
- Users are not technical — they cannot self-host
- One instance means one place to deploy skills, monitor, and update
- User sessions are isolated via Redis (per-user context, memory, order history)
- Scales horizontally when needed (session state is externalised)

**Trade-offs:**
- We own data privacy compliance (NDPR, GDPR)
- Single point of failure mitigated by Docker container restart policies
- LLM API costs are centralised (we pay, not the user)

**Future:** Enterprise clients can get dedicated tenant instances (white-label tier).

---

### ADR-003: Custom Chat UI (not WhatsApp/Telegram)

**Decision:** Build a Nuxt.js chat UI instead of relying on WhatsApp/Telegram as the primary surface.

**Rationale:**
- Full UX control (payment confirmation cards, order tracking widgets, etc.)
- MarketX embed requires a web component, not a messaging app
- Payment approval flow needs a custom UI (not just text)
- WhatsApp/Telegram can still be added as optional channels later via OpenClaw

**Trade-offs:**
- More front-end work upfront
- We handle authentication (not delegated to WhatsApp)

---

### ADR-004: BullMQ for Async Commerce Operations

**Decision:** All external API calls (payment, shipping, tracking) are async via BullMQ.

**Rationale:**
- Commerce APIs can be slow (2-10 seconds)
- Chat must feel responsive — user gets immediate acknowledgement
- Jobs are retryable on failure (critical for payment operations)
- Worker can be scaled independently of the API

**Trade-offs:**
- More infrastructure (Redis must be running for queues)
- Debugging requires checking queue state, not just API logs

---

### ADR-005: MarketX Gate as Middleware

**Decision:** MarketX registration check is enforced as Express middleware, not route-level logic.

**Rationale:**
- Impossible to accidentally bypass — runs on every protected route
- Single place to update verification logic
- Returns consistent 403 response with registration URL

**Trade-offs:**
- Every request hits the MarketX verification API (mitigated by Redis cache — cache the verified status for 15 minutes)

---

### ADR-006: Explicit Purchase Approval

**Decision:** No order is placed without the user sending an explicit approval token in the chat.

**Rationale:**
- Users authorising a bot to spend money is a high-trust interaction
- Legal protection — clear consent trail
- Prevents accidental purchases from ambiguous messages

**Implementation:**
1. Bot presents order summary with a unique `approval_token`
2. User types or clicks "Confirm" which sends the token
3. API validates token, enqueues `orderProcessor` job
4. Job executes purchase, notifies user of outcome

---

### ADR-007: Skills are Self-Contained — **UPDATED (no more skill.yml)**

**Decision:** Each skill is a self-contained directory under `apps/api/skills/` with a
single `index.js`. There is **no `skill.yml`** — the module exports its own metadata.

> Superseded detail: the original OpenClaw design used a `skill.yml` manifest. The
> custom registry (`skills.registry.ts`) instead reads exports directly, so the
> description/parameters live next to the code.

**Rationale:**
- Adding a new commerce API = add one folder; `skills.registry.ts` auto-discovers it
- Skills can be tested in isolation
- Others can contribute skills without touching the engine

**Each `index.js` must export:**
- `channels` — `['buyer']`, `['seller']`, or both (which agent may load it)
- `description` — what the skill does (used by the LLM for tool selection)
- `parameters` — JSON Schema object, passed straight to the provider as the tool schema
- `execute(inputs, context)` — the implementation; `context` carries `userToken`, store info

---

## System Diagram

```
Browser / MarketX Widget
        │
        ▼
   [Nginx :80/443]
   /api  →  [API :4000] ── ai.service (agent loop) ──┐   ←→  [Redis :6379]
   /     →  [UI  :3000]        │                     │            │
                               ▼                     ▼            ▼
                    skills.registry             Anthropic /   [BullMQ Workers]
                    (apps/api/skills/*)         OpenAI SDK         │
                               │                                   │
                               ▼                            [PostgreSQL :5432]
                        MarketX API  ◄── (also embeddings, profile,
                        /api/commerce, /api/ai/*     logs via internal.ts)
```

---

## Data Flow: Purchase Journey

```
1. User:  "Find me a pair of Nike Air Max size 42"
2. UI     → WebSocket → API
3. API    → aiService.chat()  (builds prompt: persona + profile + RAG)
4. Loop invokes tool: semantic_search / marketx ({query, filters})
5. skill → MarketX API → returns products/stores/markets
6. Loop's final text → API → UI (bot message; UI renders product cards)

7. User:  "Buy the second one"
8. Loop invokes tool: payment ({product, user})
9. payment skill creates approval_token, generates Paystack link
10. UI renders PaymentPrompt component (price, product, confirm button)

11. User clicks Confirm
12. UI sends approval_token via WebSocket
13. API validates token → enqueues orderProcessor job
14. API sends "Order placed, processing..." to UI immediately

15. Worker picks up job → calls commerce API → places order
16. Worker invokes logistics → creates shipment
17. Worker notifies user via WebSocket: "Order confirmed! Tracking: XYZ123"

18. trackingUpdater job polls every 2h → pushes status updates to user
```
