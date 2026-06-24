const { api, resolveStore, naira, verifiedMutation, previewResult } = require('../_lib')

// Images uploaded in the chat ride along on context.attachments (the UI uploads them
// to /api/media/upload first). The agent never handles the URLs — we read them here.
// MarketX's mediaItemSchema requires { url, public_id, type } — drop anything missing
// a public_id so the product create/update isn't rejected.
function collectMedia(context) {
  const raw = context?.attachments
  if (!Array.isArray(raw)) return []
  return raw
    .map((m) => ({ url: m?.url, public_id: m?.public_id || m?.publicId || '', type: m?.type || 'IMAGE' }))
    .filter((m) => m.url && m.public_id)
}

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
        enum: ['list', 'create', 'update_price', 'update_status', 'set_stock', 'archive', 'add_media'],
        description: 'Operation to perform. When the user uploads an image while creating a product, just call create — the uploaded image is attached automatically. Use add_media to attach a freshly uploaded image to an EXISTING product (each upload must be a new image — the same photo cannot be added twice).',
      },
      productId:   { type: 'string', description: 'Target product ID (required for everything except list/create).' },
      status:      { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], description: 'For list (filter) or update_status.' },
      title:       { type: 'string', description: 'Product title (create).' },
      description: { type: 'string', description: 'Product description (create).' },
      price:       { type: 'number', description: 'Price in naira (create / update_price).' },
      stock:       { type: 'number', description: 'New stock count (create / set_stock).' },
      size:        { type: 'string', description: 'Variant size/name for set_stock. If the size already exists its stock is updated; if it is new it is added as a new variant. Omit only if the product has a single unnamed variant.' },
      preview:     { type: 'boolean', description: 'For mutations (update_price/update_status/set_stock/archive): if true, RETURN the real before→after WITHOUT applying it, so the seller can confirm. Apply only on a second call with preview omitted.' },
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
      const media = collectMedia(context)
      const payload = {
        title:       inputs.title,
        price:       inputs.price,
        status:      inputs.status || 'DRAFT',
        ...(inputs.description ? { description: inputs.description } : {}),
        ...(inputs.stock != null ? { variants: [{ size: inputs.size || 'Default', stock: inputs.stock }] } : {}),
        ...(media.length ? { mediaItems: media } : {}),
      }
      const body = await api('/api/commerce/products', { userToken, method: 'POST', body: payload })
      const p = body.data ?? body
      return {
        success: true,
        message: `Created "${inputs.title}" (${payload.status})${media.length ? ` with ${media.length} image${media.length === 1 ? '' : 's'}` : ''}.`,
        productId: p.id, status: payload.status, imageCount: media.length,
      }
    }

    // everything below needs a productId
    if (!inputs.productId) throw new Error('That action needs a productId.')
    const productId = inputs.productId

    // For mutations we read the product first so both the preview AND the verify
    // use real data. A read failure is returned structured (never thrown/narrated).
    let mutProduct = null
    if (action === 'update_price' || action === 'update_status' || action === 'archive') {
      try {
        const d = await api(`/api/commerce/products/${productId}`, { userToken })
        mutProduct = d.data ?? d
      } catch (e) {
        return { kind: 'mutation', action, success: false, verified: false,
          target: { type: 'product', id: productId }, error: e.message,
          display: `I couldn't load that product (id ${productId}), so nothing was changed. ${e.message}` }
      }
      if (!mutProduct?.id) {
        return { kind: 'mutation', action, success: false, verified: false,
          target: { type: 'product', id: productId }, error: `Product ${productId} was not found.`,
          display: `I couldn't find that product (id ${productId}), so nothing was changed.` }
      }
    }
    const mutTarget = mutProduct ? { type: 'product', id: productId, label: mutProduct.title } : null

    // ── update_price ──────────────────────────────────────────────────────────
    if (action === 'update_price') {
      if (inputs.price == null) throw new Error('update_price needs a price.')
      const before = mutProduct.price
      const expected = Number(inputs.price)
      if (inputs.preview) {
        return previewResult({ action, target: mutTarget,
          change: { field: 'price', before: naira(before), after: naira(expected) } })
      }
      const result = await verifiedMutation({
        action, target: mutTarget,
        change: { field: 'price', before: naira(before), expected },
        execute: () => api(`/api/commerce/products/${productId}`, { userToken, method: 'PATCH', body: { price: expected } }),
        verify: async () => {
          const a = await api(`/api/commerce/products/${productId}`, { userToken })
          const p = a.data ?? a
          return { ok: Number(p.price) === expected, actual: p.price }
        },
      })
      result.change.actual = naira(result.change.actual)
      result.display = result.verified
        ? `Price for "${mutProduct.title}": ${naira(before)} → ${naira(expected)}.`
        : `The price change could not be confirmed, so treat it as NOT done. ${result.error}`
      result.message = result.display
      return result
    }

    // ── update_status / archive ───────────────────────────────────────────────
    if (action === 'update_status' || action === 'archive') {
      const status = action === 'archive' ? 'ARCHIVED' : inputs.status
      if (!status) throw new Error('update_status needs a status (DRAFT, PUBLISHED, or ARCHIVED).')
      const before = mutProduct.status
      if (inputs.preview) {
        return previewResult({ action, target: mutTarget,
          change: { field: 'status', before, after: status } })
      }
      const result = await verifiedMutation({
        action, target: mutTarget,
        change: { field: 'status', before, expected: status },
        execute: () => api(`/api/commerce/products/${productId}`, { userToken, method: 'PATCH', body: { status } }),
        verify: async () => {
          const a = await api(`/api/commerce/products/${productId}`, { userToken })
          const p = a.data ?? a
          return { ok: p.status === status, actual: p.status }
        },
      })
      result.display = result.verified
        ? `"${mutProduct.title}" is now ${status}${status === 'PUBLISHED' ? ' (visible to buyers)' : status === 'ARCHIVED' ? ' (hidden)' : ''}.`
        : `The status change could not be confirmed, so treat it as NOT done. ${result.error}`
      result.message = result.display
      return result
    }

    // ── set_stock (variant-safe, verified) ────────────────────────────────────
    if (action === 'set_stock') {
      if (inputs.stock == null) throw new Error('set_stock needs a stock count.')

      // Precondition read. ANY failure here is returned as a structured mutation
      // result (never thrown) so the agent can't narrate a fabricated cause and the
      // UI shows the real reason — nothing was changed.
      let product
      try {
        const detail = await api(`/api/commerce/products/${productId}`, { userToken })
        product = detail.data ?? detail
      } catch (e) {
        return {
          kind: 'mutation', action: 'set_stock', success: false, verified: false,
          target: { type: 'product', id: productId },
          error: e.message,
          display: `I couldn't load that product (id ${productId}), so nothing was changed. ${e.message}`,
        }
      }
      if (!product?.id) {
        return {
          kind: 'mutation', action: 'set_stock', success: false, verified: false,
          target: { type: 'product', id: productId },
          error: `Product ${productId} was not found.`,
          display: `I couldn't find that product (id ${productId}), so nothing was changed.`,
        }
      }
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

      // The size this operation targets, and its stock BEFORE the write (real data).
      const targetSize = inputs.size || current[0]?.size || 'Default'
      const beforeStock = current.find(
        (v) => (v.size || '').toLowerCase() === targetSize.toLowerCase(),
      )?.stock ?? null

      if (inputs.preview) {
        return previewResult({
          action: 'set_stock',
          target: { type: 'product', id: productId, label: product.title },
          change: { field: `stock · ${targetSize}`, before: beforeStock ?? 0, after: Number(inputs.stock) },
        })
      }

      // Write, then RE-READ and confirm the variant actually holds the new stock.
      const result = await verifiedMutation({
        action: 'set_stock',
        target: { type: 'product', id: productId, label: product.title },
        change: { field: `stock · ${targetSize}`, before: beforeStock, expected: Number(inputs.stock) },
        execute: () => api(`/api/commerce/products/${productId}`, { userToken, method: 'PATCH', body: { variants } }),
        verify: async () => {
          const after = await api(`/api/commerce/products/${productId}`, { userToken })
          const ap = after.data ?? after
          const v = (ap.variants || []).find(
            (x) => (x.size || '').toLowerCase() === targetSize.toLowerCase(),
          )
          return { ok: v != null && Number(v.stock) === Number(inputs.stock), actual: v?.stock ?? null }
        },
      })

      // Factual outcome line, bound to verified values (the agent only relays this).
      result.display = result.verified
        ? `${addedNewSize ? 'Added' : 'Updated'} ${targetSize} — stock ${beforeStock ?? 0} → ${result.change.actual} for "${product.title}".`
        : `The stock update for ${targetSize} could not be confirmed, so treat it as NOT done. ${result.error}`
      result.message = result.display
      return result
    }

    // ── add_media (attach uploaded image(s) to a product, verified) ─────────────
    if (action === 'add_media') {
      const media = collectMedia(context)
      if (!media.length) {
        return { kind: 'mutation', action: 'add_media', success: false, verified: false,
          target: { type: 'product', id: productId },
          error: 'No uploaded image found on this message.',
          display: `There's no uploaded image to add — please attach a photo and try again.` }
      }
      let product
      try { const d = await api(`/api/commerce/products/${productId}`, { userToken }); product = d.data ?? d }
      catch (e) {
        return { kind: 'mutation', action: 'add_media', success: false, verified: false,
          target: { type: 'product', id: productId }, error: e.message,
          display: `I couldn't load that product (id ${productId}), so nothing was changed. ${e.message}` }
      }
      const before = (product.media || []).filter((m) => !m.isBgMusic).length
      const result = await verifiedMutation({
        action: 'add_media',
        target: { type: 'product', id: productId, label: product.title },
        change: { field: 'images', before, expected: before + media.length },
        execute: () => api(`/api/commerce/products/${productId}`, { userToken, method: 'PATCH', body: { mediaItems: media } }),
        verify: async () => {
          const a = await api(`/api/commerce/products/${productId}`, { userToken })
          const ap = a.data ?? a
          const after = (ap.media || []).filter((m) => !m.isBgMusic).length
          return { ok: after >= before + media.length, actual: after }
        },
      })
      result.display = result.verified
        ? `Added ${media.length} image${media.length === 1 ? '' : 's'} to "${product.title}" (${before} → ${result.change.actual}).`
        : `The image couldn't be confirmed on the product, so treat it as NOT added. ${result.error}`
      result.message = result.display
      return result
    }

    throw new Error(`Unknown action: ${action}`)
  },
}
