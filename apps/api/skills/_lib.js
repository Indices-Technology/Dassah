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

/**
 * Run a mutation with read-after-write verification.
 *
 * The whole point: the OUTCOME is never the LLM's word. We write, then RE-READ the
 * source of truth and confirm the change actually landed. HTTP 200 is not proof —
 * the re-read is. The returned object is a structured, factual result the *system*
 * reports (and the UI renders); the agent only relays it. This is what makes
 * "lying" structurally impossible for mutating actions.
 *
 * @param {object}   o
 * @param {string}   o.action   - e.g. 'set_stock'
 * @param {object}   o.target   - { type, id, label } for the result card
 * @param {object}   o.change   - { field, before, expected }
 * @param {Function} o.execute  - async () => void        performs the write (may throw)
 * @param {Function} o.verify   - async () => { ok, actual }   re-reads + checks truth
 * @returns {Promise<object>} { kind:'mutation', action, success, verified, target, change, error }
 */
async function verifiedMutation({ action, target, change, execute, verify }) {
  let writeError = null
  try {
    await execute()
  } catch (e) {
    writeError = e.message            // real API error — never fabricated
  }

  // Read-after-write: the database is the authority, not the write's status code.
  let verified = false
  let actual = null
  try {
    const v = await verify()
    verified = !!v.ok
    actual = v.actual
  } catch (e) {
    if (!writeError) writeError = e.message
  }

  return {
    kind:    'mutation',
    action,
    success: verified,
    verified,
    target,
    change:  { ...change, actual },
    error:   verified
      ? null
      : (writeError || `Verification failed — expected ${change?.expected}, found ${actual}.`),
  }
}

/**
 * A grounded preview of a pending mutation — the real "before" (freshly read) and
 * the proposed "after", so the confirmation the seller approves is built from the
 * API, not the agent's memory. Returned WITHOUT executing anything.
 */
function previewResult({ action, target, change }) {
  return { kind: 'preview', action, target, change }
}

module.exports = { BASE_URL, api, authHeaders, resolveStore, kobo, naira, verifiedMutation, previewResult }
