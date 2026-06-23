# Workstream 1 — Full Seller Management via Chat (Implementation Spec)

> Goal: a seller manages their **entire** store by chatting — analytics, orders,
> inventory, payouts, profile — everything the seller site does, rendered richly.
> Each capability = one skill under `apps/api/skills/<name>/index.js` consuming the
> live MarketX API. Tools authenticate as the seller via `Authorization: Bearer
> <userToken>` (the `X-API-Key` header is harmless legacy — MarketX uses the bearer).
>
> **Field-name discipline:** MarketX uses snake_case + specific names. Drift = silent
> breakage. Authoritative shapes: `marketX/docs/openapi.json` + `API_STRUCTURE.md`.

## Tool → endpoint map (with correct shapes)

| Tool (skill) | Capability | MarketX endpoint(s) | Notes / drift fixes |
|---|---|---|---|
| `seller_analytics` *(rewrite)* | revenue, orders, units, **views, impressions**, per-product, time-series | `GET /api/seller/analytics/{storeSlug}?days=N` | Use the purpose-built endpoint (returns `{ summary, series, products }`). Stop summing orders client-side. |
| `product_management` *(rewrite of store_management)* | list / create / update / archive products; **variant stock** | `GET /commerce/products?sellerId=&status=`, `POST /commerce/products`, `PATCH /commerce/products/{id}`, `DELETE /commerce/products/{id}` | Fix inventory: stock is **per-variant** (`variants:[{size,stock}]`), not `inventory.available`. Use `title` not `name`, `media` not `images`. |
| `seller_orders` *(new)* | list store orders, detail, update status, mark shipped + tracking | `GET /commerce/orders/seller?storeSlug=`, `GET /commerce/orders/{id}`, `PATCH /commerce/orders/{id}/status` | Order money field is `totalAmount`; date is `created_at`. Seller breakdown in `sellerBreakdown`. |
| `seller_wallet` *(new)* | balance, transactions, payout preview, withdraw, bank accounts | `GET /commerce/wallet/store/{storeSlug}`, `GET /commerce/wallet/transactions`, `GET /commerce/wallet/payout-preview`, `POST /commerce/wallet/withdraw`, `GET/POST /seller/bank-accounts` | Wallet balances in **kobo** (÷100 for ₦). Withdraw = mutating → confirm first. |
| `store_profile` *(new)* | view + update store, activate/deactivate | `GET /seller/by-slug/{slug}`, `PATCH /seller/{id}`, `POST /seller/{id}/activate`/`deactivate` | `{id}` for PATCH/activate = sellerProfile **UUID**; `by-slug` = slug. |
| `social_media` *(exists)* | campaigns | — | Keep. |

## Conventions for every seller tool
- **Resolve store context once:** prefer `context.storeSlug`; else `GET /api/profile` →
  `data.sellerProfile.store_slug` / `.id`. (Reuse a shared helper, not copy-paste.)
- **Money:** wallet/order amounts are **kobo** unless a field is documented NGN
  (e.g. `sellerBreakdown.net`). Convert at the edge; label `₦`.
- **Mutations** (price, status, withdraw, profile) → the agent must confirm with the
  seller before calling (reuse the approval pattern).
- **Return structured data** for rich UI rendering (charts/cards/tables), not prose.
- **Errors:** throw with a clear message; the loop surfaces it to the model.

## Rich rendering (UI, follow-up)
Extend the existing "UI renders cards, not markdown" rule to seller surfaces:
analytics → chart/summary card; orders → order cards; inventory → product table.
Tool results land in `toolResults[<name>]` for the UI to render (Claude path only —
see findings A.4).

## Status — tools
- [x] seller_analytics rewrite
- [x] store_management (product mgmt, variant-safe stock)
- [x] seller_orders
- [x] seller_wallet
- [x] store_profile
- [x] SELLER_BASE prompt update
- [x] **Live integration test vs staging — all green** (`apps/api/test-seller-tools.cjs`).
      Found + fixed: `set_stock` sent `price: null` (schema rejects null) → omit when absent.

## Status — in-chat UI rendering
The in-chat component (`layers/chat/components/chat/MessageBubble.vue`) only rendered
**product cards** (+ payment / cart / quick-replies). Analytics/orders/wallet metadata was
built server-side but never rendered, and the new seller tools weren't mapped into metadata.

- [x] Wire new seller tools into `buildMessageMetadata` (`apps/api/src/index.ts`):
      `store_management`→product cards, `seller_orders`→`meta.orders`, `seller_wallet`→`meta.wallet`.
- [x] **AnalyticsCard.vue** — KPI grid + daily-revenue chart + top products; wired into MessageBubble.
- [ ] **OrderList card** for `meta.orders` (seller orders) — metadata is wired; component TODO.
- [ ] **WalletCard** for `meta.wallet` (balance/transactions/bank accounts) — metadata wired; component TODO.
- [ ] Live UI smoke test (run the Nuxt stack, seller-mode chat).
