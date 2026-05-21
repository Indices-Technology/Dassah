const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

module.exports = {
  channels: ['buyer'],
  description: 'Fetches currently trending products on MarketX based on engagement and sales velocity.',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max results (default 8)' },
    },
  },

  async execute(inputs, context) {
    const { limit = 8 } = inputs
    const headers = { 'X-API-Key': API_KEY }

    const res = await fetch(`${BASE_URL}/api/feed/trending`, { headers })
    if (!res.ok) throw new Error(`Trending feed failed: ${res.status}`)

    const body = await res.json()
    const items = (body.data?.trendingProducts ?? []).slice(0, limit)

    const products = items.map((p) => ({
      id:       p.id,
      name:     p.title || p.name,
      price:    p.price,
      currency: 'NGN',
      seller:   p.seller?.store_name || p.sellerProfile?.storeName,
      imageUrl: p.media?.[0]?.url,
      inStock:  p.status === 'PUBLISHED',
      slug:     p.slug,
      discount: p.discount ?? null,
    }))

    return { products, total: products.length }
  },
}
