const { api, resolveStore, naira } = require('../_lib')

// Full product management for a seller's store: list, create, update price/status,
// set stock (variant-safe), and archive. Stock on MarketX lives on VARIANTS and
// updates upsert-by-size — so set_stock fetches the product first and resends the
// FULL variant array (sending a partial array would delete the other sizes).

module.exports = {
  channels: ['seller'],
  description:
    "Manage the seller's products on MarketX: list their products, create a new one, " +
    'update price or status (DRAFT/PUBLISHED/ARCHIVED), set or add stock for a product, ' +
    'or archive a product. Stock is per size/variant: set_stock updates an existing size, ' +
    'or ADDS a new size (e.g. "add US size 32 - 10 pcs") if it does not exist yet.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'create', 'update_price', 'update_status', 'set_stock', 'archive'],
        description: 'Operation to perform.',
      },
      productId:   { type: 'string', description: 'Target product ID (required for everything except list/create).' },
      status:      { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], description: 'For list (filter) or update_status.' },
      title:       { type: 'string', description: 'Product title (create).' },
      description: { type: 'string', description: 'Product description (create).' },
      price:       { type: 'number', description: 'Price in naira (create / update_price).' },
      stock:       { type: 'number', description: 'New stock count (create / set_stock).' },
      size:        { type: 'string', description: 'Variant size/name for set_stock. If the size already exists its stock is updated; if it is new it is added as a new variant. Omit only if the product has a single unnamed variant.' },
    },
    required: ['action'],
  },

  async execute(inputs, context) {
    const { action } = inputs
    const userToken = context?.userToken

    // ── list ──────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const { id } = await resolveStore(context)
      const status = inputs.status || 'PUBLISHED'
      const body = await api(
        `/api/commerce/products?sellerId=${encodeURIComponent(id)}&status=${status}&limit=50`,
        { userToken },
      )
      const products = (body.data?.products ?? []).map((p) => ({
        id:        p.id,
        title:     p.title,
        price:     p.price,
        status:    p.status,
        slug:      p.slug,
        thumbnail: p.media?.[0]?.url ?? null,
      }))
      return { status, count: products.length, products, currency: 'NGN' }
    }

    // ── create ────────────────────────────────────────────────────────────────
    if (action === 'create') {
      if (!inputs.title || inputs.price == null) {
        throw new Error('Creating a product needs at least a title and a price.')
      }
      const payload = {
        title:       inputs.title,
        price:       inputs.price,
        status:      inputs.status || 'DRAFT',
        ...(inputs.description ? { description: inputs.description } : {}),
        ...(inputs.stock != null ? { variants: [{ size: inputs.size || 'Default', stock: inputs.stock }] } : {}),
      }
      const body = await api('/api/commerce/products', { userToken, method: 'POST', body: payload })
      const p = body.data ?? body
      return { success: true, message: `Created "${inputs.title}" (${payload.status}).`, productId: p.id, status: payload.status }
    }

    // everything below needs a productId
    if (!inputs.productId) throw new Error('That action needs a productId.')
    const productId = inputs.productId

    // ── update_price ──────────────────────────────────────────────────────────
    if (action === 'update_price') {
      if (inputs.price == null) throw new Error('update_price needs a price.')
      await api(`/api/commerce/products/${productId}`, { userToken, method: 'PATCH', body: { price: inputs.price } })
      return { success: true, message: `Price updated to ${naira(inputs.price)}.` }
    }

    // ── update_status / archive ───────────────────────────────────────────────
    if (action === 'update_status' || action === 'archive') {
      const status = action === 'archive' ? 'ARCHIVED' : inputs.status
      if (!status) throw new Error('update_status needs a status (DRAFT, PUBLISHED, or ARCHIVED).')
      await api(`/api/commerce/products/${productId}`, { userToken, method: 'PATCH', body: { status } })
      return { success: true, message: `Product is now ${status}.` }
    }

    // ── set_stock (variant-safe) ──────────────────────────────────────────────
    if (action === 'set_stock') {
      if (inputs.stock == null) throw new Error('set_stock needs a stock count.')
      // Fetch current variants so we resend the full set (upsert-by-size deletes omitted sizes).
      const detail = await api(`/api/commerce/products/${productId}`, { userToken })
      const product = detail.data ?? detail
      const current = Array.isArray(product.variants) ? product.variants : []

      // Build a variant for the update body. Omit `price` when the source has none —
      // the schema accepts an absent price but rejects `null`.
      const mkVariant = (v, stock) => ({
        size: v.size || 'Default',
        stock,
        ...(typeof v.price === 'number' ? { price: v.price } : {}),
      })

      let variants
      let addedNewSize = false
      if (current.length === 0) {
        variants = [mkVariant({ size: inputs.size }, inputs.stock)]
        addedNewSize = !!inputs.size
      } else if (inputs.size) {
        const match = current.find((v) => (v.size || '').toLowerCase() === inputs.size.toLowerCase())
        if (match) {
          // Existing size → update its stock, resend the rest unchanged.
          variants = current.map((v) => mkVariant(v, v === match ? inputs.stock : v.stock))
        } else {
          // New size → add it. MarketX upserts variants by size and creates new ones,
          // so we append it to the full set. Inherit a price (from an existing variant
          // or the product) so the variant is valid and sellable.
          const inheritedPrice = current.find((v) => typeof v.price === 'number')?.price
            ?? (typeof product.price === 'number' ? product.price : undefined)
          variants = [
            ...current.map((v) => mkVariant(v, v.stock)),
            {
              size: inputs.size,
              stock: inputs.stock,
              ...(typeof inheritedPrice === 'number' ? { price: inheritedPrice } : {}),
            },
          ]
          addedNewSize = true
        }
      } else if (current.length === 1) {
        variants = [mkVariant(current[0], inputs.stock)]
      } else {
        const sizes = current.map((v) => v.size).filter(Boolean).join(', ')
        throw new Error(`This product has multiple sizes (${sizes}). Tell me which size to set stock for.`)
      }

      await api(`/api/commerce/products/${productId}`, { userToken, method: 'PATCH', body: { variants } })
      return {
        success: true,
        message: addedNewSize
          ? `Added size ${inputs.size} with ${inputs.stock} units in stock.`
          : `Stock set to ${inputs.stock}${inputs.size ? ` for size ${inputs.size}` : ''}.`,
      }
    }

    throw new Error(`Unknown action: ${action}`)
  },
}
