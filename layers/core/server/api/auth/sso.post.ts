import { defineEventHandler, readBody, createError } from 'h3'
import { randomBytes } from 'crypto'

const MARKETX_BASE_URL = process.env.MARKETX_BASE_URL || 'http://localhost:3000'
const DASSAH_BASE_URL = process.env.NUXT_PUBLIC_BASE_URL || 'http://localhost:3001'
const CLIENT_ID = process.env.OAUTH_MARKETX_CLIENT_ID || 'dassah'

/**
 * POST /api/auth/sso
 *
 * Initiates the "Sign in with MarketX" OAuth 2.0 Authorization Code flow.
 * Returns the URL that the client should redirect to.
 *
 * Body: { redirect_after?: string }  — optional path to navigate to after login
 * Returns: { authorizeUrl: string }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ redirect_after?: string }>(event).catch(() => ({}))
  const redirectAfter = body?.redirect_after ?? '/chat'

  const state = randomBytes(16).toString('hex') + '.' + encodeURIComponent(redirectAfter)
  const redirectUri = `${DASSAH_BASE_URL}/api/auth/sso/callback`

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    scope: 'openid email profile',
  })

  return {
    authorizeUrl: `${MARKETX_BASE_URL}/api/oauth/authorize?${params.toString()}`,
  }
})
