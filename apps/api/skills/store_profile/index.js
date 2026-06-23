const { api, resolveStore } = require('../_lib')

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

    // ── update ────────────────────────────────────────────────────────────────
    if (action === 'update') {
      const payload = {}
      for (const k of EDITABLE) if (inputs[k] != null) payload[k] = inputs[k]
      if (Object.keys(payload).length === 0) {
        throw new Error('Nothing to update. Provide a store name, description, phone, or location.')
      }
      await api(`/api/seller/${id}`, { userToken, method: 'PATCH', body: payload })
      return { success: true, message: `Store updated: ${Object.keys(payload).join(', ')}.` }
    }

    // ── activate / deactivate ──────────────────────────────────────────────────
    if (action === 'activate' || action === 'deactivate') {
      await api(`/api/seller/${id}/${action}`, { userToken, method: 'POST' })
      return { success: true, message: `Store ${action === 'activate' ? 'activated — now visible to buyers' : 'deactivated — hidden from buyers'}.` }
    }

    throw new Error(`Unknown action: ${action}`)
  },
}
