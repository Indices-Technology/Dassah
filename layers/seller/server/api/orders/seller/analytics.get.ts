// GET /api/orders/seller/analytics?storeId=&timeframe=
// CP-6: Fetch today's (or any timeframe) analytics for a specific store.
// storeId is required — the client sends the actively-selected store's ID.
// Falls back to user.sellerId from JWT for backward compat with single-store tokens.

import { defineEventHandler, createError, getQuery } from 'h3'
import { requireUser } from '~~/layers/core/server/utils/auth'
import { fetchFromMarketX, requireMarketXToken } from '~~/layers/seller/server/utils/marketx'

export default defineEventHandler(async (event) => {
  const user = requireUser(event) as any
  const token = requireMarketXToken(event)
  const { storeId, timeframe = 'today' } = getQuery(event)

  // CP-6 — resolve which store to query
  const resolvedStoreId = (storeId as string) || user.sellerId
  if (!resolvedStoreId) {
    throw createError({ statusCode: 400, statusMessage: 'storeId is required' })
  }

  return fetchFromMarketX(
    `/seller/${resolvedStoreId}/analytics?timeframe=${timeframe}`,
    token,
    undefined,
    event,
  )
})
