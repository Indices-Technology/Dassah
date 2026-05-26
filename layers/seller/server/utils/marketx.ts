import { H3Event, createError } from 'h3'

/**
 * Make an authenticated request to the MarketX API.
 *
 * @param path      - API path, e.g. `/sellers/abc/analytics`
 * @param userToken - The caller's MarketX JWT (forwarded from the Nuxt request)
 * @param options   - Optional fetch overrides (method, body, etc.)
 * @param event     - H3Event — used to read runtimeConfig with request context
 */
export async function fetchFromMarketX(
  path: string,
  userToken: string,
  options?: RequestInit,
  event?: H3Event,
): Promise<any> {
  // useRuntimeConfig(event) is reliable in Nitro — picks up NUXT_ prefixed Railway vars.
  const config = useRuntimeConfig(event as H3Event)
  const MARKETX_API_URL = (config.marketxApiUrl as string) || process.env.MARKETX_API_URL
  const MARKETX_API_KEY = (config.marketxApiKey as string) || process.env.MARKETX_API_KEY

  if (!MARKETX_API_URL || !MARKETX_API_KEY) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[MarketX] credentials missing — bypassing for local dev')
      return {}
    }
    throw createError({ statusCode: 500, statusMessage: 'MarketX not configured' })
  }

  const res = await fetch(`${MARKETX_API_URL}${path}`, {
    ...options,
    headers: {
      'X-API-Key': MARKETX_API_KEY,
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: `MarketX API error: ${res.status} ${res.statusText}`,
    })
  }

  return res.json()
}

/**
 * Extract the MarketX Bearer token from the current H3 event.
 * Throws 401 if no token is present.
 */
export function requireMarketXToken(event: H3Event): string {
  const auth = event.node.req.headers.authorization
  if (auth?.startsWith('Bearer ')) return auth.slice(7)

  throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
}
