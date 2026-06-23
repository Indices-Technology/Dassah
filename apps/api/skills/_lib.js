// Shared helpers for MarketX skills.
// NOTE: not a skill itself — the registry only loads *directories* (skills.registry.ts
// filters `d.isDirectory()`), so this top-level file is ignored by discovery.

const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

/** Bearer-auth headers. `X-API-Key` is harmless legacy; MarketX authenticates the bearer. */
function authHeaders(userToken, json) {
  if (!userToken) throw new Error('This action requires an authenticated session. Please sign in.')
  const h = { 'X-API-Key': API_KEY, Authorization: `Bearer ${userToken}` }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

/** Call the MarketX API and return parsed JSON, throwing a readable error on non-2xx. */
async function api(pathname, { userToken, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: authHeaders(userToken, body != null),
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : {} } catch { json = { raw: text } }
  if (!res.ok) {
    const msg = json?.statusMessage || json?.message || `${res.status} ${res.statusText}`
    throw new Error(`MarketX ${method} ${pathname} → ${msg}`)
  }
  return json
}

/** Resolve the seller's store { slug, id } from session context or /api/profile. */
async function resolveStore(context) {
  let slug = context?.storeSlug
  let id   = context?.storeId
  if (slug && id) return { slug, id }
  const body = await api('/api/profile', { userToken: context?.userToken })
  const sp = body.data?.sellerProfile
  if (!sp) throw new Error('No seller store is linked to this account.')
  return { slug: slug || sp.store_slug, id: id || sp.id }
}

const kobo  = (n) => Number(n ?? 0) / 100                              // kobo → naira number
const naira = (n) => `₦${Number(n ?? 0).toLocaleString('en-NG')}`     // display string

module.exports = { BASE_URL, api, authHeaders, resolveStore, kobo, naira }
