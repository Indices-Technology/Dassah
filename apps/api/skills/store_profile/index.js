const { api, resolveStore, verifiedMutation, previewResult } = require('../_lib')

// View and edit the seller's store profile, and activate/deactivate the store.
// View is by slug; PATCH/activate/deactivate use the sellerProfile UUID (resolveStore.id).

const EDITABLE = ['store_name', 'store_description', 'store_phone', 'store_location']

module.exports = {
  channels: ['seller'],
  description:
    "View or edit the seller's store profile (name, description, phone, location) and " +
    'activate or deactivate the store. Use for "edit my store / change store name / open ' +
    'or close my shop" requests.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['view', 'update', 'activate', 'deactivate'],
        description: 'Operation to perform (default: view).',
      },
      store_name:        { type: 'string', description: 'New store name (update).' },
      store_description: { type: 'string', description: 'New store description (update).' },
      store_phone:       { type: 'string', description: 'New store phone (update).' },
      store_location:    { type: 'string', description: 'New store location (update).' },
      preview:           { type: 'boolean', description: 'For update/activate/deactivate: if true, return the real before→after WITHOUT applying it, so the seller can confirm. Apply on a second call with preview omitted.' },
    },
  },

  async execute(inputs, context) {
    const { action = 'view' } = inputs
    const userToken = context?.userToken
    const { slug, id } = await resolveStore(context)

    // ── view ──────────────────────────────────────────────────────────────────
    if (action === 'view') {
      const body = await api(`/api/seller/by-slug/${encodeURIComponent(slug)}`, { userToken })
      const s = body.data ?? body
      return {
        storeName:    s.store_name,
        storeSlug:    s.store_slug,
        description:  s.store_description ?? null,
        phone:        s.store_phone ?? null,
        location:     s.store_location ?? s.locationLabel ?? null,
        isActive:     s.is_active,
        followers:    s.followers_count ?? null,
        logo:         s.store_logo ?? null,
      }
    }

    const target = { type: 'store', id, label: slug }
    // Read current profile once — used for before-state, preview, and verify.
    const readProfile = async () => {
      const b = await api(`/api/seller/by-slug/${encodeURIComponent(slug)}`, { userToken })
      return b.data ?? b
    }

    // ── update (verified) ───────────────────────────────────────────────────────
    if (action === 'update') {
      const payload = {}
      for (const k of EDITABLE) if (inputs[k] != null) payload[k] = inputs[k]
      const fields = Object.keys(payload)
      if (fields.length === 0) {
        throw new Error('Nothing to update. Provide a store name, description, phone, or location.')
      }

      let current
      try { current = await readProfile() } catch (e) {
        return { kind: 'mutation', action, success: false, verified: false, target, error: e.message,
          display: `I couldn't load your store, so nothing was changed. ${e.message}` }
      }

      const fieldLabel = fields.join(', ')
      if (inputs.preview) {
        // Show the first changed field's before→after concretely.
        const f = fields[0]
        return previewResult({ action, target,
          change: { field: f, before: current[f] ?? '—', after: payload[f] } })
      }

      // Verify against the PATCH's own returned row (Prisma's persisted record).
      // The seller GET endpoints are inconsistent for these fields (by-slug omits
      // store_description; /api/profile can return it stale), so the write's
      // authoritative return is the reliable source of truth here.
      let resp = null
      const result = await verifiedMutation({
        action, target,
        change: { field: fieldLabel, before: current[fields[0]] ?? '—', expected: payload[fields[0]] },
        execute: async () => { const r = await api(`/api/seller/${id}`, { userToken, method: 'PATCH', body: payload }); resp = r.data ?? r },
        verify: async () => {
          const after = resp || {}
          const ok = fields.every((k) => String(after[k] ?? '') === String(payload[k]))
          return { ok, actual: after[fields[0]] }
        },
      })
      result.display = result.verified
        ? `Store updated — ${fieldLabel}.`
        : `The store update could not be confirmed, so treat it as NOT done. ${result.error}`
      result.message = result.display
      return result
    }

    // ── activate / deactivate (verified) ────────────────────────────────────────
    if (action === 'activate' || action === 'deactivate') {
      const want = action === 'activate'   // expected is_active
      if (inputs.preview) {
        let current
        try { current = await readProfile() } catch (e) {
          return { kind: 'mutation', action, success: false, verified: false, target, error: e.message,
            display: `I couldn't load your store. ${e.message}` }
        }
        return previewResult({ action, target,
          change: { field: 'store visibility', before: current.is_active ? 'active' : 'hidden', after: want ? 'active' : 'hidden' } })
      }

      let resp = null
      const result = await verifiedMutation({
        action, target,
        change: { field: 'store visibility', before: null, expected: want ? 'active' : 'hidden' },
        execute: async () => { const r = await api(`/api/seller/${id}/${action}`, { userToken, method: 'POST' }); resp = r.data ?? r },
        verify: async () => {
          const after = resp || {}
          return { ok: !!after.is_active === want, actual: after.is_active ? 'active' : 'hidden' }
        },
      })
      result.display = result.verified
        ? `Store is now ${want ? 'active — visible to buyers' : 'deactivated — hidden from buyers'}.`
        : `The store ${action} could not be confirmed, so treat it as NOT done. ${result.error}`
      result.message = result.display
      return result
    }

    throw new Error(`Unknown action: ${action}`)
  },
}
