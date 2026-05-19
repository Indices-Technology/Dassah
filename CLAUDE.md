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
| Agent Engine | OpenClaw (self-hosted gateway) |
| Job Queue | BullMQ (Redis-backed) |
| Sessions/Cache | Redis |
| Database | PostgreSQL (managed via Prisma) |
| Reverse Proxy | Nginx |
| Containers | Docker + Docker Compose |

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
│   │   ├── src/
│   │   │   ├── index.ts        ← entry point
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts    ← MarketX SSO
│   │   │   │   ├── chat.ts   ← WebSocket chat relay
│   │   │   │   └── orders.ts  ← Order management (buyer + seller)
│   │   │   ├── services/
│   │   │   │   ├── openclaw.ts ← OpenClaw client
│   │   │   │   ├── marketx.ts  ← MarketX API client
│   │   │   │   ├── session.ts  ← Redis session store
│   │   │   │   └── queue.ts    ← BullMQ producer
│   │   │   └── middleware/
│   │   │       ├── auth.ts    ← JWT validation
│   │   │       └── marketxGate.ts ← MarketX verification
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
├── openclaw/
│   ├── config/
│   │   ├── openclaw.yml       ← Dual agent configuration
│   │   └── seller_agent.yml   ← Seller agent config
│   └── skills/
│       ├── marketx/            ← product search
│       ├── payment/           ← checkout generation
│       ├── logistics/         ← shipping calculation
│       ├── tracker/           ← order tracking
│       ├── dispute/           ← refund/dispute handling
│       ├── store_management/  ← seller: inventory/pricing
│       ├── social_media/      ← seller: campaigns
│       └── seller_analytics/  ← seller: sales reports
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

2. **OpenClaw is the agent brain** — the API does NOT contain business logic.
   It relays messages to OpenClaw and streams responses back. Skills contain
   all integration logic.

3. **Dual agents via session:type** — users emit `session:type` event with
   'buyer' or 'seller' to switch between agents. The API routes to the
   appropriate OpenClaw channel.

4. **No purchase executes without explicit user approval** — the payment skill
   generates a confirmation prompt. The user must respond with an approval token.
   Only then does the `orderProcessor` job run.

5. **Seller notifications are real-time** — when an order is placed, the worker
   publishes to `notify:{sellerId}` so sellers get instant "Cha-ching!" alerts.

6. **Skills are plug-and-play** — to add a new commerce API, create a new folder
   under `openclaw/skills/`, write `skill.yml` and `index.js`, and restart OpenClaw.

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
- API: http://localhost:4000
- OpenClaw: http://localhost:5000

## Seller Features

The seller agent supports:
- **store_management**: Update prices and inventory
- **seller_analytics**: Query sales, revenue, orders by timeframe
- **social_media**: Post to Instagram, WhatsApp broadcasts
- **tracker**: Check shipping status for customer orders

## Current Status

- [x] OpenClaw gateway configured (dual agents)
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
