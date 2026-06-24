// PATCH /api/orders/seller/orders/{orderId}/status
// Advance an order's status (CONFIRMED / SHIPPED / DELIVERED / CANCELLED).
//
// MarketX endpoint: PATCH /api/commerce/orders/{orderId}/status
// Body: { status, trackingNumber?, shipper? } — the seller is identified from the
// token, NOT from a sellerId in the body (MarketX JWTs don't carry sellerId).

import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { requireUser } from '~~/layers/core/server/utils/auth'
import { fetchFromMarketX, requireMarketXToken } from '~~/layers/seller/server/utils/marketx'

export default defineEventHandler(async (event) => {
  requireUser(event)
  const token = requireMarketXToken(event)
  const orderId = getRouterParam(event, 'orderId')
  if (!orderId) throw createError({ statusCode: 400, statusMessage: 'orderId is required' })

  const { status, trackingNumber, shipper } = await readBody(event)
  if (!status) throw createError({ statusCode: 400, statusMessage: 'status is required' })

  return fetchFromMarketX(`/commerce/orders/${orderId}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      ...(trackingNumber ? { trackingNumber } : {}),
      ...(shipper ? { shipper } : {}),
    }),
  }, event)
})
