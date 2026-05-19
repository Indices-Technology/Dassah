import { defineEventHandler, getQuery, sendRedirect, createError } from 'h3'

const MARKETX_BASE_URL = process.env.MARKETX_BASE_URL || 'http://localhost:3000'
const DASSAH_BASE_URL = process.env.NUXT_PUBLIC_BASE_URL || 'http://localhost:3001'
const CLIENT_ID = process.env.OAUTH_MARKETX_CLIENT_ID || 'dassah'
const CLIENT_SECRET =
  process.env.OAUTH_MARKETX_CLIENT_SECRET || 'dassah_secret_change_in_production'

/**
 * GET /api/auth/sso/callback
 *
 * Receives the authorization code from MarketX, exchanges it for
 * access + refresh tokens, fetches user info, and hands everything
 * to the client via a redirect with query params.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, string>
  const { code, state, error: oauthError } = query

  if (oauthError) {
    return sendRedirect(event, `/?sso_error=${encodeURIComponent(oauthError)}`, 302)
  }

  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Missing authorization code' })
  }

  const redirectAfter = state?.includes('.')
    ? decodeURIComponent(state.split('.').slice(1).join('.'))
    : '/chat'

  const redirectUri = `${DASSAH_BASE_URL}/api/auth/sso/callback`

  // 1. Exchange code → access_token + refresh_token
  let accessToken: string
  let refreshToken: string
  try {
    const tokenRes = await $fetch<{
      access_token: string
      refresh_token: string
      token_type: string
      expires_in: number
    }>(`${MARKETX_BASE_URL}/api/oauth/token`, {
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
      },
    })
    accessToken = tokenRes.access_token
    refreshToken = tokenRes.refresh_token
  } catch (e: any) {
    console.error('[sso/callback] token exchange failed:', e)
    throw createError({ statusCode: 502, statusMessage: 'Failed to exchange authorization code' })
  }

  // 2. Fetch user profile
  let userInfo: {
    sub: string
    email: string
    name: string
    picture: string | null
    role: string
  }
  try {
    userInfo = await $fetch(`${MARKETX_BASE_URL}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (e: any) {
    console.error('[sso/callback] userinfo fetch failed:', e)
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch user info from MarketX' })
  }

  // 3. Redirect to client — tokens carried in query params so the
  //    client-side page can persist them to localStorage
  const params = new URLSearchParams({
    sso_token: accessToken,
    sso_refresh: refreshToken,
    sso_user: JSON.stringify({
      id: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture ?? '',
    }),
    redirect: redirectAfter,
  })

  return sendRedirect(event, `/?${params.toString()}`, 302)
})
