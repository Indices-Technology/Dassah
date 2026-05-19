const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

module.exports = {
  channels: ['buyer'],
  description: 'Manages the shopping cart — view current cart, add a product, or remove an item.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['view', 'add', 'remove'],
        description: 'view = show cart contents, add = add product to cart, remove = remove a variant from cart',
      },
      productId: {
        type: 'string',
        description: 'MarketX product ID (required for add)',
      },
      variantId: {
        type: 'string',
        description: 'Specific variant ID — required for remove; optional for add (defaults to first available variant)',
      },
      quantity: {
        type: 'number',
        description: 'Number of units to add (default 1)',
      },
    },
    required: ['action'],
  },

  async execute(inputs, context) {
    const { action, productId, variantId, quantity = 1 } = inputs
    const userToken = context?.userToken

    if (!userToken) throw new Error('Cart requires an authenticated session.')

    const authHeaders = {
      'X-API-Key':     API_KEY,
      Authorization:   `Bearer ${userToken}`,
      'Content-Type':  'application/json',
    }

    // ── View cart ─────────────────────────────────────────────────────────────
    if (action === 'view') {
      const res = await fetch(`${BASE_URL}/api/commerce/cart`, { headers: authHeaders })
      if (!res.ok) throw new Error(`Cart fetch failed: ${res.status}`)
      const body = await res.json()
      const items = Array.isArray(body.data) ? body.data : (body.data?.items ?? [])

      const formatted = items.map((item) => ({
        variantId:   item.variantId ?? item.variant?.id,
        productName: item.variant?.product?.name || item.variant?.product?.title,
        size:        item.variant?.size ?? null,
        price:       (item.variant?.price ?? item.price ?? 0) / 100,
        quantity:    item.quantity,
        currency:    'NGN',
      }))

      const subtotal = formatted.reduce((s, i) => s + i.price * i.quantity, 0)
      return { items: formatted, subtotal, currency: 'NGN', count: formatted.length }
    }

    // ── Add to cart ───────────────────────────────────────────────────────────
    if (action === 'add') {
      if (!productId) throw new Error('productId is required to add to cart.')

      let resolvedVariantId = variantId ? Number(variantId) : null

      if (!resolvedVariantId) {
        // Fetch product to find the first variant with stock
        const prodRes = await fetch(`${BASE_URL}/api/commerce/products/${productId}`, {
          headers: { 'X-API-Key': API_KEY },
        })
        if (!prodRes.ok) throw new Error(`Product not found (${prodRes.status}).`)
        const prodBody = await prodRes.json()
        const variants = prodBody.data?.variants ?? []
        if (!variants.length) throw new Error('This product has no available variants.')
        const pick = variants.find((v) => v.stock > 0) ?? variants[0]
        resolvedVariantId = pick.id
      }

      const res = await fetch(`${BASE_URL}/api/commerce/cart`, {
        method:  'POST',
        headers: authHeaders,
        body:    JSON.stringify({ variantId: resolvedVariantId, quantity: Number(quantity) }),
      })

      if (res.status === 409) return { success: false, message: 'This item is already in your cart.' }
      if (!res.ok) {
        const err = await res.text().catch(() => res.status)
        throw new Error(`Add to cart failed: ${err}`)
      }

      const body = await res.json()
      return {
        success: true,
        message: 'Item added to your cart.',
        variantId: resolvedVariantId,
        cartItem: body.data,
      }
    }

    // ── Remove from cart ──────────────────────────────────────────────────────
    if (action === 'remove') {
      if (!variantId) throw new Error('variantId is required to remove an item from the cart.')
      const res = await fetch(`${BASE_URL}/api/commerce/cart/${variantId}`, {
        method:  'DELETE',
        headers: authHeaders,
      })
      if (!res.ok) throw new Error(`Remove from cart failed: ${res.status}`)
      return { success: true, message: 'Item removed from your cart.' }
    }

    throw new Error('Invalid action. Use: view, add, or remove.')
  },
}
