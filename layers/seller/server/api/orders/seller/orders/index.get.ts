import { defineEventHandler, createError } from 'h3'
import { requireUser } from '~~/layers/core/server/utils/auth'
import { fetchFromMarketX, requireMarketXToken } from '~~/layers/seller/server/utils/marketx'

export default defineEventHandler(async (event) => {
  const user = requireUser(event) as any
  if (!user.sellerId) {
    throw createError({ statusCode: 403, statusMessage: 'User is not a seller' })
  }

  const token = requireMarketXToken(event)

  return fetchFromMarketX(`/sellers/${user.sellerId}/orders`, token)
})
