# Dasah — Architecture Plan of Record

_Last updated: 2026-07-13_

This is the single source of truth for what Dasah is becoming and in what order.
When a change seems to conflict with this plan, update this file in the same PR —
do not let the code and the plan drift (that is exactly the failure we are undoing).

---

## The decision

**Dasah is one custom agent engine — kept, formalized, and consolidated.**
Not OpenClaw. Not a fleet of per-function agents.

The long-term "AI operating system for INDICES" vision is adopted as *direction*.
But we build only the seams the product actually needs today, and we defer the rest
until a concrete second channel or workflow forces them. One brain, many interfaces —
earned incrementally, not scaffolded up front.

### What is already true in the code (the foundation)

The engine already exists; it was just unnamed and mixed into a flat `services/` folder:

- **Engine** — `apps/api/src/services/ai.service.ts` (Anthropic + OpenAI tool loop, max 5 steps)
- **Tool registry** — `skills.registry.ts` auto-discovers `apps/api/skills/*/index.js`
- **User memory** — `user-profile.service.ts` (measurements/budget/style, Redis + MarketX)
- **Retrieval / RAG** — `embedding.service.ts` + `retrieveContext()` over products/sellers/markets
- **Guard rails** — `guard.service.ts` (prompt-injection, PII redaction, tool-input checks)
- **Telemetry** — `internalClient.logTurn` / `logGuardEvent`

### What was removed (Phase 0, done)

Dead and actively misleading, now deleted:
`services/openclaw.ts`, `services/skillRegistry.ts`, `services/marketx.ts`,
root `skills/` (legacy OpenClaw format), root `chat.vue` / `index.vue` (unrouted scaffolding).

> Note: root `nuxt.config.ts` is **not** dead — it is the real Nuxt app entry that
> `extends` the four UI layers. It stays.

---

## Phases

Ordered by value-per-effort. **Committed scope: Phases 0 → 2.**

### Phase 0 — Stop lying _(done)_
- [x] Delete the dead code (see above)
- [ ] Rewrite `CLAUDE.md` + `docs/ARCHITECTURE.md` to describe the real engine (no OpenClaw)

Zero behavior change. Prerequisite for trusting the tree.

### Phase 1 — One MarketX seam
Consolidate every MarketX call into one typed client.

Today the MarketX contract is smeared across ~20 skills + `apps/api/skills/_lib.js`
+ `apps/api/src/lib/internal.ts`. Target:

```
packages/core/integrations/marketx/
  client.ts      # folds _lib.api() + internalClient into one typed client
  auth.ts        # the two schemes: Bearer <userToken>  vs  X-Dassah-Internal
  endpoints.ts   # the path table (kill the /api-prefix drift)
```

Skills call `marketx.orders.list()` instead of hand-rolled `fetch`.

**Auth invariant (do not break):** user actions pass the real `Bearer <userToken>`
straight through — **MarketX**, not Dasah, is the authority on what a user may do.

### Phase 2 — Persona layers
Promote the two hardcoded prompts (`BUYER_BASE` / `SELLER_BASE`) into a registry of
composable layers.

```
packages/core/personas/
  layer.ts       # { id, prompt, grants[], denies?, memory? }
  resolve.ts     # prompt = concat; tools = union(grants) minus union(denies)  (deny wins)
  buyer.ts seller.ts support.ts founder.ts   # each = an ordered stack of layers
```

- Migrate skills' `channels: ['buyer','seller']` → finer capability `tags`.
- Backward-compatible with today's buyer/seller behavior.
- New scope = **append a layer**, never edit an existing one. `denies` can only
  subtract capability; safety lives in the base layer and is resolved first.

---

## Explicitly deferred (empty seams until a real need appears)

Planner module · Workflow engine · Event bus · WhatsApp / voice / SDK adapters ·
Knowledge-base corpus.

Building any of these now is speculative framework-for-one-consumer. Each becomes a
folder only when a concrete second consumer exists.

### Phase 3 — Name the core _(deferred, high-churn)_
Lift `apps/api/src/services/` → `packages/core/{engine,memory,retrieval,guard,tools,integrations}`.
Only after Phases 0–2 land and prove stable — it rewrites every import path across
`api` + `worker`.
