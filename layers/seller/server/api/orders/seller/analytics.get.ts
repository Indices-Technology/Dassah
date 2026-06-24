// GET /api/orders/seller/analytics?storeId=&storeSlug=&timeframe=
// Today's (or any timeframe) analytics for a specific store.
//
// MarketX endpoint is keyed by store SLUG: GET /api/seller/analytics/{slug}?days=N
// (looks up `where: { store_slug }`, param is `days` clamped 7–90). The dashboard
// sends a storeId (UUID), so we resolve it to a slug via /seller/mine.

import { defineEventHandler, createError, getQuery } from 'h3'
import { requireUser } from '~~/layers/core/server/utils/auth'
import { fetchFromMarketX, requireMarketXToken } from '~~/layers/seller/server/utils/marketx'

const TIMEFRAME_DAYS: Record<string, number> = { today: 7, week: 7, month: 30, all: 90 }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const user = requireUser(event) as any
  const token = requireMarketXToken(event)
  const { storeId, storeSlug, timeframe = 'today' } = getQuery(event) as Record<string, string>

  const days = TIMEFRAME_DAYS[timeframe] ?? 30

  // Resolve the store SLUG (MarketX analytics is slug-keyed).
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

  const res = await fetchFromMarketX(`/seller/analytics/${slug}?days=${days}`, token, undefined, event)

  // Flatten MarketX's { summary, chart, topProducts } into the shape the dashboard reads.
  const data = res?.data ?? {}
  const s = data.summary ?? {}
  const views = Number(s.views ?? 0)
  const orders = Number(s.orders ?? 0)
  const conversionRate = views > 0 ? Math.round((orders / views) * 1000) / 10 : 0

  return {
    success: true,
    data: {
      revenue:       Number(s.revenue ?? 0),
      orders,
      unitsSold:     Number(s.unitsSold ?? 0),
      visitors:      views,
      impressions:   Number(s.impressions ?? 0),
      affiliatePaid: Number(s.affiliatePaid ?? 0),
      conversionRate,
      // MarketX analytics has no period-over-period delta yet.
      revenueChange:  null,
      ordersChange:   null,
      visitorsChange: null,
      chart:          data.chart ?? [],
      topProducts:    data.topProducts ?? [],
      days,
    },
  }
})
