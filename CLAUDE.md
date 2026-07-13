# DassaAI — Agent Instructions

## What This Project Is

DassaAI is an AI-powered conversational commerce platform built on OpenClaw.
It serves **two distinct user types**:

### 1. Buyers
Discover products on MarketX and partner platforms, make purchases, track shipments, and handle disputes entirely through a chat interface.

### 2. Sellers
Manage their MarketX stores completely through AI - run ads, manage inventory, view analytics, handle orders, and run social media campaigns.

### Surfaces
1. **Standalone chat UI** — a Nuxt 3 web app at the root domain
2. **MarketX Extension** — embedded widget inside marketx.indicestech.com
   (a social commerce platform owned by the same team)

Only users registered on MarketX can access the MarketX gateway.

## Tech Stack

| Layer | Technology |
|---|---|
| Chat UI | Nuxt 3, Nuxt Layers, TypeScript, Tailwind CSS, Socket.IO client |
| API | Node.js, Express, TypeScript, Prisma ORM, Socket.IO server |
| Agent Engine | **Custom loop in `apps/api/src/services/ai.service.ts`** — calls Anthropic / OpenAI directly, LLM swappable per user |
| Tool Registry | File-based auto-discovery (`skills.registry.ts` → `apps/api/skills/*/index.js`) |
| Job Queue | BullMQ (Redis-backed) |
| Sessions/Cache | Redis |
| Database | PostgreSQL (managed via Prisma) |
| Reverse Proxy | Nginx |
| Containers | Docker + Docker Compose |

> **History:** an earlier design used OpenClaw as the agent gateway (see the git
> history and older ADRs). That is gone — the engine is now a custom tool loop.
> If you see references to OpenClaw anywhere, they are stale; fix them.
>
> **Direction:** see [docs/DASAH_PLAN.md](docs/DASAH_PLAN.md) for the architecture
> plan of record (personas-as-layers, consolidated MarketX client, what's deferred).

**ORM Note:** Prisma is the default ORM. If query performance becomes an issue
on complex joins (e.g. order history with joins across 3+ tables), drop down to
raw SQL via `prisma.$queryRaw`. Do not switch ORM — optimise the query first.

## Architecture Overview

### Dual-Agent System
The platform uses **two separate AI agents**:
- **dassai-web**: Buyer agent for shopping, payments, tracking
- **dassai-seller-web**: Seller agent for store management, analytics, campaigns

Users switch between modes via the `session:type` socket event.

### Nuxt Layers
The UI uses **Nuxt Layers** for clean separation:
- `layers/seller/`: Shared seller components, pages, and types
- `apps/ui/`: Buyer-facing application (extends seller layer)

## Repository Structure

```
dassai/
├── CLAUDE.md                   ← YOU ARE HERE
├── ARCHITECTURE.md             ← system design decisions
├── README.md                   ← quick start
├── docker-compose.yml          ← local dev
├── docker-compose.prod.yml     ← production overrides
├── .env.example                ← environment variables
│
├── layers/
│   └── seller/                 ← Seller layer (extended by UI)
│       ├── nuxt.config.ts      ← Layer config
│       ├── pages/
│       │   └── seller/
│       │       └── chat.vue   ← Seller dashboard
│       ├── components/
│       │   └── chat/          ← Reusable chat components
│       └── types/
│           └── index.ts
│
├── apps/
│   ├── api/                    ← Express REST + WebSocket API
│   │   ├── skills/             ← the tool registry (auto-discovered)
│   │   │   ├── _lib.js         ← shared MarketX api() helper + verifiedMutation
│   │   │   └── <skill>/index.js  ← one folder per tool (semantic_search, payment, …)
│   │   ├── src/
│   │   │   ├── index.ts        ← entry point (Express + Socket.IO, chat relay)
│   │   │   ├── services/
│   │   │   │   ├── ai.service.ts        ← THE ENGINE (agent loop + prompts)
│   │   │   │   ├── skills.registry.ts   ← tool auto-discovery / loader
│   │   │   │   ├── embedding.service.ts ← query/entity embeddings
│   │   │   │   ├── guard.service.ts     ← injection / PII / tool-input guards
│   │   │   │   ├── user-profile.service.ts ← per-user memory
│   │   │   │   ├── session.ts  ← Redis session store
│   │   │   │   └── queue.ts    ← BullMQ producer
│   │   │   ├── lib/
│   │   │   │   └── internal.ts ← MarketX internal /api/ai/* client (X-Dassah-Internal)
│   │   │   ├── workers/indexer.ts ← embedding indexer
│   │   │   └── middleware/auth.ts ← JWT validation
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── ui/                     ← Nuxt 3 chat frontend
│   │   ├── nuxt.config.ts      ← Extends seller layer
│   │   ├── pages/
│   │   │   ├── index.vue      ← landing / login
│   │   │   ├── chat.vue       ← buyer chat
│   │   │   └── seller/
│   │   │       └── chat.vue   ← seller dashboard
│   │   ├── components/
│   │   │   └── chat/           ← Chat UI components
│   │   ├── composables/
│   │   │   ├── useSocket.ts   ← Socket.IO client
│   │   │   ├── useChat.ts     ← chat state
│   │   │   └── useAuth.ts     ← auth state
│   │   ├── middleware/
│   │   │   └── auth.ts        ← route protection
│   │   ├── plugins/
│   │   │   └── socket.client.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── worker/                 ← BullMQ async job processor
│       ├── src/
│       │   ├── index.ts       ← entry point
│       │   ├── queues/
│       │   │   └── index.ts   ← queue definitions
│       │   └── jobs/
│       │       ├── orderProcessor.ts    ← executes purchases
│       │       ├── trackingUpdater.ts   ← polls shipping APIs
│       │       ├── notifier.ts          ← chat notifications
│       │       └── sellerCampaign.ts    ← social media campaigns
│       ├── Dockerfile
│       └── package.json
│
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
│
└── infra/
    └── nginx/
        └── nginx.conf
```

## Key Architectural Rules

1. **All user sessions are stored in Redis** — never in-memory. This keeps every
   service stateless so you can add replicas without breaking sessions.

2. **The engine is `ai.service.ts`** — the API's chat route relays a message to
   `aiService.chat()`, which builds the system prompt (persona + user profile + RAG),
   loads the allowed skills, and runs the tool loop against Anthropic/OpenAI. Skills
   contain all MarketX integration logic; the API route itself holds no business logic.

3. **Dual agents via session:type** — users emit `session:type` event with
   'buyer' or 'seller' to switch between agents. The API routes to the
   appropriate OpenClaw channel.

4. **No purchase executes without explicit user approval** — the payment skill
   generates a confirmation prompt. The user must respond with an approval token.
   Only then does the `orderProcessor` job run.

5. **Seller notifications are real-time** — when an order is placed, the worker
   publishes to `notify:{sellerId}` so sellers get instant "Cha-ching!" alerts.

6. **Skills are plug-and-play** — to add a new commerce API, create a new folder
   under `apps/api/skills/`, exporting `{ channels, description, parameters, execute }`
   from `index.js`. `skills.registry.ts` auto-discovers it on next load — no restart
   ceremony, no manifest. (See `_lib.js` for the shared MarketX `api()` helper.)

7. **Nuxt Layers for separation** — seller components live in `layers/seller/`.
   The main UI extends this layer. This enables code reuse while keeping
   buyer/seller concerns separate.

8. **Async by default** — any operation that touches an external API (payment,
   shipping, tracking, campaigns) goes through BullMQ. The chat UI gets an
   immediate acknowledgement, then receives a push notification when complete.

## Environment Variables

All variables are documented in `.env.example`. Never commit `.env`.
Key variables:
- `OPENCLAW_URL`: OpenClaw gateway URL
- `MARKETX_API_URL`: MarketX API endpoint
- `REDIS_URL`: Redis connection
- `JWT_SECRET`: Auth token secret

## Running Locally

```bash
cp .env.example .env
docker compose up --build
```

- UI: http://localhost:3000
- API: http://localhost:4000 (Express + Socket.IO + the agent engine)

## Seller Features

The seller agent supports:
- **store_management**: Update prices and inventory
- **seller_analytics**: Query sales, revenue, orders by timeframe
- **social_media**: Post to Instagram, WhatsApp broadcasts
- **tracker**: Check shipping status for customer orders

## Current Status

- [x] Agent engine (`ai.service.ts`) — Anthropic + OpenAI, dual channels (buyer/seller)
- [x] Tool registry (`skills.registry.ts`) auto-discovering `apps/api/skills/`
- [x] RAG retrieval + embedding indexer; guard rails; per-user memory
- [x] MarketX skill implemented
- [x] Payment skill (Paystack) implemented
- [x] Logistics skill implemented
- [x] Tracker skill implemented
- [x] Dispute skill implemented
- [x] Seller skills (store_management, social_media, seller_analytics)
- [x] Buyer chat UI
- [x] Seller dashboard (/seller/chat)
- [x] Nuxt Layer structure
- [x] API routes (buyer + seller)
- [x] Worker jobs (including seller campaigns)
- [ ] MarketX SSO integration (verify endpoints)
- [ ] Production deployment

## Contact

Project: DassaAI
Parent platform: MarketX (marketx.indicestech.com)
Owner: Indices Technologies
