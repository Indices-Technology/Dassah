import { H3Event, getHeader, createError } from 'h3'
import process from 'process'
import { createPublicKey, type KeyObject } from 'crypto'
// @ts-ignore: jsonwebtoken types not installed
// Must be an ESM import — Nitro bundles server code to .mjs where `require` is
// undefined, so `const jwt = require('jsonwebtoken')` crashes at module load (500).
import jwt from 'jsonwebtoken'

// ── MarketX token verification ───────────────────────────────────────────────
//
// MarketX signs access tokens with ES256 and publishes the public key at
// /.well-known/jwks.json. Dasah verifies against that key, so it can check a
// MarketX login without being able to mint one. HS256 + JWT_SECRET is accepted
// only during the cutover (see marketX docs/AUTHENTICATION.md).
//
// ponytail: same JWKS cache as apps/api/src/middleware/auth.ts (separate
// builds, no shared package). Replaced by an OIDC client when Eigen lands.

const JWKS_REFETCH_COOLDOWN_MS = 30_000
let jwks = new Map<string, KeyObject>()
let lastJwksFetch = 0
let jwksInflight: Promise<void> | null = null

async function fetchJwks(marketxUrl: string) {
  const res = await fetch(new URL('/.well-known/jwks.json', marketxUrl), {
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
  const body = (await res.json()) as { keys?: any[] }
  // Replace, don't merge: a key MarketX stopped publishing must stop verifying.
  jwks = new Map(
    (body.keys ?? [])
      .filter((k) => k.kid && k.alg === 'ES256')
      .map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })]),
  )
}

async function marketxKey(kid: string, marketxUrl: string) {
  if (!jwks.has(kid)) {
    // Cooldown stops a flood of made-up kids from hammering MarketX.
    if (!jwksInflight && Date.now() - lastJwksFetch > JWKS_REFETCH_COOLDOWN_MS) {
      lastJwksFetch = Date.now()
      jwksInflight = fetchJwks(marketxUrl)
        .catch((err) => console.error('[auth] MarketX JWKS:', err.message))
        .finally(() => { jwksInflight = null })
    }
    if (jwksInflight) await jwksInflight
  }
  const key = jwks.get(kid)
  if (!key) throw new Error('unknown kid')
  return key
}

export async function verifyMarketXToken(token: string, marketxUrl: string | undefined) {
  const header = jwt.decode(token, { complete: true })?.header
  if (header?.alg === 'ES256') {
    if (!marketxUrl || !header.kid) throw new Error('cannot verify ES256 token')
    const key = await marketxKey(header.kid, marketxUrl)
    return jwt.verify(token, key, { algorithms: ['ES256'] }) as any
  }
  // Cutover only. Delete with JWT_SECRET once MarketX signs ES256 everywhere.
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set')
  return jwt.verify(token, secret, { algorithms: ['HS256'] }) as any
}

export async function getUserFromEvent(event: H3Event): Promise<{ id: string; [key: string]: any } | null> {
  const authHeader = getHeader(event, 'Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const raw = authHeader.split(' ')[1]
  const marketxUrl = (useRuntimeConfig(event).marketxApiUrl as string) || process.env.MARKETX_API_URL
  try {
    return await verifyMarketXToken(raw, marketxUrl)
  } catch {
    return null
  }
}

export async function requireUser(event: H3Event) {
  const user = await getUserFromEvent(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return user
}
