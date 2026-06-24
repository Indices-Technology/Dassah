// GET /api/orders/seller/orders?storeId=&storeSlug=&status=&limit=
// List a store's incoming orders.
//
// MarketX endpoint: GET /api/commerce/orders/seller?storeSlug={slug}&limit=N
// (seller is identified from the token; slug scopes to one store). The dashboard
// sends a storeId (UUID) which we resolve to a slug via /seller/mine.

import { defineEventHandler, createError, getQuery } from 'h3'
import { requireUser } from '~~/layers/core/server/utils/auth'
import { fetchFromMarketX, requireMarketXToken } from '~~/layers/seller/server/utils/marketx'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const user = requireUser(event) as any
  const token = requireMarketXToken(event)
  const { storeId, storeSlug, status, limit = '20' } = getQuery(event) as Record<string, string>

  // Resolve the store slug (MarketX orders are scoped by slug).
  let slug = storeSlug || (storeId && !UUID_RE.test(storeId) ? storeId : '')
  if (!slug) {
    const id = storeId || user.sellerId
    if (!id) throw createError({ statusCode: 400, statusMessage: 'storeId or storeSlug is required' })
    const mine = await fetchFromMarketX('/seller/mine', token, undefined, event)
    const stores: any[] = mine?.data ?? []
    const match = stores.find((s) => s.id === id) ?? stores[0]
    slug = match?.store_slug
    if (!slug) throw createError({ statusCode: 404, statusMessage: 'No store found for this user' })
  }

  const res = await fetchFromMarketX(
    `/commerce/orders/seller?storeSlug=${encodeURIComponent(slug)}&limit=${limit}`,
    token,
    undefined,
    event,
  )

  let orders: any[] = res?.data?.orders ?? []
  if (status) orders = orders.filter((o) => o.status === status)
  return { success: true, data: { orders } }
})
