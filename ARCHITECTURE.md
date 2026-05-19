# DassaAI — Architecture Decisions

## Decision Log

Every significant architectural choice is recorded here with its rationale.
When in doubt about why something is structured a certain way, check this file first.

---

### ADR-001: OpenClaw as Agent Engine

**Decision:** Use OpenClaw as the AI agent gateway rather than building a custom agent loop.

**Rationale:**
- OpenClaw provides a mature skill system (plug-and-play integrations)
- Self-hosted: all user data stays on our infrastructure
- Supports Claude, GPT, DeepSeek, and local Ollama — LLM is swappable
- Connects to messaging platforms (WhatsApp, Telegram) as optional future channels
- 250K+ GitHub stars, active community

**Trade-offs:**
- OpenClaw governance is in transition (founder joined OpenAI, Feb 2026)
- We must monitor the project for breaking changes
- Skills must be written in OpenClaw's format (not generic)

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

### ADR-007: Skills are Self-Contained

**Decision:** Each OpenClaw skill is a self-contained directory with its own `index.js` and `skill.yml`.

**Rationale:**
- Adding a new commerce API = add one folder, restart OpenClaw
- Skills can be tested in isolation
- Other agents/developers can contribute skills without touching the core

**Skill manifest (`skill.yml`) must define:**
- `name` — unique identifier
- `description` — what the skill does (used by LLM for tool selection)
- `triggers` — example phrases that invoke this skill
- `inputs` — parameters the skill expects
- `outputs` — what the skill returns

---

## System Diagram

```
Browser / MarketX Widget
        │
        ▼
   [Nginx :80/443]
   /api  →  [API :4000]  ←→  [Redis :6379]
   /     →  [UI  :3000]           │
                │                 │
                ▼                 ▼
         [OpenClaw :5000]   [BullMQ Workers]
                │                 │
         ┌──────┴──────┐          │
         │   Skills    │          │
         │  marketx    │    [PostgreSQL :5432]
         │  payment    │
         │  logistics  │
         │  tracker    │
         │  dispute    │
         └─────────────┘
```

---

## Data Flow: Purchase Journey

```
1. User:  "Find me a pair of Nike Air Max size 42"
2. UI     → WebSocket → API
3. API    → OpenClaw  (relay message)
4. OpenClaw invokes skill: marketx.search({query, filters})
5. marketx skill → MarketX API → returns product list
6. OpenClaw formats response → API → UI (bot message with product cards)

7. User:  "Buy the second one"
8. OpenClaw invokes skill: payment.generateLink({product, user})
9. payment skill creates approval_token, generates Paystack link
10. UI renders PaymentPrompt component (price, product, confirm button)

11. User clicks Confirm
12. UI sends approval_token via WebSocket
13. API validates token → enqueues orderProcessor job
14. API sends "Order placed, processing..." to UI immediately

15. Worker picks up job → calls commerce API → places order
16. Worker invokes skill: logistics.createShipment(order)
17. Worker notifies user via WebSocket: "Order confirmed! Tracking: XYZ123"

18. trackingUpdater job polls every 2h → pushes status updates to user
```
