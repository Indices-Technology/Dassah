const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

module.exports = {
  channels: ['buyer', 'seller'],
  description: 'Searches the MarketX platform for products matching a query, category, or price limit.',
  parameters: {
    type: 'object',
    properties: {
      query:    { type: 'string', description: 'Search term (e.g. "Nike shoes", "laptop")' },
      limit:    { type: 'number', description: 'Max results to return (default 5)' },
      sellerId: { type: 'string', description: 'Restrict results to a specific seller' },
    },
    required: ['query'],
  },

  async execute(inputs, context) {
    const { query, limit = 5, sellerId } = inputs
    const userToken = context?.userToken

    const headers = {
      'X-API-Key': API_KEY,
      ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
    }

    const params = new URLSearchParams({ limit: String(limit), status: 'PUBLISHED' })
    if (query) params.set('search', query)
    if (sellerId) params.set('sellerId', sellerId)

    const res = await fetch(`${BASE_URL}/api/commerce/products?${params}`, { headers })
    if (!res.ok) throw new Error(`MarketX product search failed: ${res.status}`)

    // Response shape: { success: true, data: { products: [], total: N, limit: N, offset: N } }
    const body = await res.json()
    const inner = body.data ?? {}
    const products = (inner.products ?? []).map((p) => ({
      id:       p.id,
      name:     p.title || p.name,
      price:    p.price,
      discount: p.discount ?? null,
      currency: 'NGN',
      seller:   p.seller?.store_name,
      sellerId: p.sellerId,
      imageUrl: p.media?.[0]?.url,
      inStock:  !p.variants?.length || p.variants.some(v => v.stock > 0),
      slug:     p.slug,
    }))

    return { products, total: inner.total ?? products.length }
  },
}
