// GET /api/seller/stores
// CP-2: Fetch all SellerProfiles owned by the authenticated MarketX user.
//
// NOTE: this file MUST be named `stores.get.ts` (→ /api/seller/stores). As
// `index.get.ts` it mapped to /api/seller and the client's /api/seller/stores 404'd.
//
// MarketX dependency: GET /api/seller/mine
//   → returns { success: true, data: SellerProfile[] } for the authenticated user.
//
// Fallback for single-store accounts: if the MarketX token carries a sellerId
// claim in the JWT payload, we synthesise a one-item list so the UI still works.

import { defineEventHandler, createError } from 'h3'
import { fetchFromMarketX, requireMarketXToken } from '~~/layers/seller/server/utils/marketx'
import { requireUser } from '../../../../core/server/utils/auth'

export interface SellerStoreSummary {
  id: string
  store_name: string
  store_slug: string
  store_logo: string | null
  is_active: boolean
  averageRating: number | null
  totalReviews: number
  followers_count: number
}

export default defineEventHandler(async (event) => {
  const user = requireUser(event) as any
  const token = requireMarketXToken(event)

  try {
    // Primary path: MarketX /api/seller/mine (the marketx util prepends /api).
    const res = await fetchFromMarketX('/seller/mine', token, undefined, event)
    const stores: SellerStoreSummary[] = res?.data ?? []
    return { success: true, data: stores }
  } catch (err: any) {
    // Fallback: synthesise from JWT claims if /mine is unreachable.
    if (user.sellerId && user.storeName && user.storeSlug) {
      return {
        success: true,
        data: [{
          id: user.sellerId,
          store_name: user.storeName,
          store_slug: user.storeSlug,
          store_logo: user.storeLogo ?? null,
          is_active: true,
          averageRating: null,
          totalReviews: 0,
          followers_count: 0,
        }] satisfies SellerStoreSummary[],
      }
    }

    // Surface the real cause in deploy logs — Nitro masks 5xx messages to a
    // generic "Server Error" in production, so the client never sees this.
    // Most common cause: MARKETX_API_URL / MARKETX_API_KEY missing on the UI
    // deployment (→ "MarketX not configured" thrown from fetchFromMarketX).
    console.error('[seller/stores] failed:', err?.statusCode, err?.statusMessage || err?.message)

    throw createError({
      statusCode: err.statusCode ?? 502,
      statusMessage: err.statusMessage ?? 'Could not load your stores from MarketX',
    })
  }
})
