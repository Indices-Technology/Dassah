import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { requireUser } from '~~/layers/core/server/utils/auth'
import { fetchFromMarketX, requireMarketXToken } from '~~/layers/seller/server/utils/marketx'

export default defineEventHandler(async (event) => {
  const user = requireUser(event) as any
  if (!user.sellerId) {
    throw createError({ statusCode: 403, statusMessage: 'User is not a seller' })
  }

  const token = requireMarketXToken(event)
  const orderId = getRouterParam(event, 'orderId')
  const { status } = await readBody(event)

  return fetchFromMarketX(`/orders/${orderId}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sellerId: user.sellerId, status }),
  })
})
