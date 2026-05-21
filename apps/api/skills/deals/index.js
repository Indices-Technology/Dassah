const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

module.exports = {
  channels: ['buyer'],
  description: 'Fetches current deals and discounted products from the MarketX deals feed.',
  parameters: {
    type: 'object',
    properties: {
      limit:  { type: 'number', description: 'Max results (default 8)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    },
  },

  async execute(inputs, context) {
    const { limit = 8, offset = 0 } = inputs
    const headers = { 'X-API-Key': API_KEY }

    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    const res = await fetch(`${BASE_URL}/api/feed/deals?${params}`, { headers })
    if (!res.ok) throw new Error(`Deals feed failed: ${res.status}`)

    const body = await res.json()
    const items = body.data ?? []

    const products = items.map((p) => ({
      id:       p.id,
      name:     p.title || p.name,
      price:    p.price,
      discount: p.discount ?? null,
      currency: 'NGN',
      seller:   p.seller?.store_name,
      imageUrl: p.media?.[0]?.url,
      inStock:  true,
      slug:     p.slug,
      dealEndsAt: p.dealEndsAt ?? null,
    }))

    return { products, total: products.length, hasMore: body.meta?.hasMore ?? false }
  },
}
