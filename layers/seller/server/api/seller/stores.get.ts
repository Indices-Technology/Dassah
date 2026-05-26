// GET /api/seller/stores
// CP-2: Fetch all SellerProfiles owned by the authenticated MarketX user.
//
// MarketX dependency: GET /api/seller/mine
//   → returns { success: true, data: SellerProfile[] } for the authenticated user
//   → Must exist on MarketX (add layers/seller/server/api/seller/mine.get.ts there)
//
// Fallback for single-store accounts: if the MarketX token carries a sellerId
// claim in the JWT payload, we synthesise a one-item list so the UI still works
// while the /mine endpoint is being deployed.

import { defineEventHandler, createError } from 'h3'
import { requireUser } from '~~/layers/core/server/utils/auth'
import { fetchFromMarketX, requireMarketXToken } from '~~/layers/seller/server/utils/marketx'

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
  // CP-2 — auth
  const user = requireUser(event) as any
  const token = requireMarketXToken(event)

  try {
    // CP-2 — primary path: MarketX /api/seller/mine
    const res = await fetchFromMarketX('/seller/mine', token, undefined, event)
    const stores: SellerStoreSummary[] = res?.data ?? []
    return { success: true, data: stores }
  } catch (err: any) {
    // CP-2 fallback: if MarketX /mine not yet deployed, synthesise from JWT claim
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

    // CP-2 — genuine failure: propagate so client can show retry state
    throw createError({
      statusCode: err.statusCode ?? 502,
      statusMessage: err.statusMessage ?? 'Could not load your stores from MarketX',
    })
  }
})
