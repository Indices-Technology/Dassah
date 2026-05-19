import { defineEventHandler, readBody, createError } from 'h3'

const MARKETX_BASE_URL = process.env.MARKETX_BASE_URL || 'http://localhost:3000'
const CLIENT_ID = process.env.OAUTH_MARKETX_CLIENT_ID || 'dassah'
const CLIENT_SECRET =
  process.env.OAUTH_MARKETX_CLIENT_SECRET || 'dassah_secret_change_in_production'

/**
 * POST /api/auth/sso/refresh
 *
 * Proxies a refresh token exchange to MarketX on behalf of the client.
 * Keeps the client_secret server-side — never exposed to the browser.
 *
 * Body: { refresh_token }
 * Returns: { access_token, refresh_token, expires_in }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ refresh_token: string }>(event)

  if (!body?.refresh_token) {
    throw createError({ statusCode: 400, statusMessage: 'Missing refresh_token' })
  }

  try {
    const result = await $fetch<{
      access_token: string
      refresh_token: string
      token_type: string
      expires_in: number
    }>(`${MARKETX_BASE_URL}/api/oauth/refresh`, {
      method: 'POST',
      body: {
        grant_type: 'refresh_token',
        refresh_token: body.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      },
    })

    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_in: result.expires_in,
    }
  } catch (e: any) {
    const status = e?.response?.status ?? e?.statusCode ?? 502
    // Propagate 401 so the client knows to force re-login
    throw createError({
      statusCode: status === 401 ? 401 : 502,
      statusMessage:
        status === 401 ? 'Refresh token expired — please sign in again' : 'Token refresh failed',
    })
  }
})
