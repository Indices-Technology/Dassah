// View one market/square and the products sold inside it.
//
// Both fetches here are RAW queries (not embeddings):
//   • /api/squares/:slug                      — market profile by slug
//   • /api/commerce/products?squareSlug=:slug — its published products
// Use after semantic_search (or a "marketSlug: <value>" message) surfaces a
// market the user wants to explore.
const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

function mapProduct(p) {
  return {
    id:          p.id,
    name:        p.title || p.name,
    price:       p.price,
    discount:    p.discount ?? null,
    currency:    'NGN',
    condition:   p.condition ?? null,
    description: p.description ?? null,
    rating:      p.averageRating ?? null,
    reviews:     p.totalReviews ?? 0,
    isDeal:      p.isDeal ?? false,
    isThrift:    p.isThrift ?? false,
    seller:      p.seller?.store_name,
    sellerId:    p.sellerId,
    imageUrl:    p.media?.[0]?.url,
    inStock:     !p.variants?.length || p.variants.some((v) => v.stock > 0),
    slug:        p.slug,
  }
}

module.exports = {
  channels: ['buyer', 'seller'],
  description:
    'View a specific MarketX market/square and the products sold inside it. Use when a user wants ' +
    'to explore a market — physical (e.g. "Balogun Market") or a category market — for example ' +
    'after semantic_search surfaces a market, or when a message contains "marketSlug: <value>". ' +
    'Returns the market profile (location, member/follower counts, description) and its published ' +
    'products. The UI renders the products as cards automatically.',
  parameters: {
    type: 'object',
    properties: {
      slug:  { type: 'string', description: 'Market / square slug, e.g. "balogun-market"' },
      limit: { type: 'number', description: 'Max products to return (default 12)' },
    },
    required: ['slug'],
  },

  async execute(inputs, context) {
    const { slug, limit = 12 } = inputs
    const userToken = context?.userToken
    const headers = {
      'X-API-Key': API_KEY,
      ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
    }

    const productParams = new URLSearchParams({
      squareSlug: slug,
      status:     'PUBLISHED',
      limit:      String(limit),
    })

    const [marketRes, prodRes] = await Promise.all([
      fetch(`${BASE_URL}/api/squares/${encodeURIComponent(slug)}`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`${BASE_URL}/api/commerce/products?${productParams}`, { headers })
        .then((r) => (r.ok ? r.json() : { data: {} }))
        .catch(() => ({ data: {} })),
    ])

    const d = marketRes?.data ?? marketRes
    let market = null
    if (d && (d.id || d.name)) {
      market = {
        id:          d.id,
        name:        d.name,
        slug:        d.slug || slug,
        description: d.description ?? null,
        type:        d.type ?? null,
        city:        d.city ?? null,
        state:       d.state ?? null,
        address:     d.physicalAddress ?? null,
        members:     d.memberCount ?? null,
        followers:   d.followerCount ?? null,
        bannerUrl:   d.bannerUrl ?? null,
        iconUrl:     d.iconUrl ?? null,
        marketUrl:   `${BASE_URL}/squares/${d.slug || slug}`,
      }
    }

    const products = (prodRes.data?.products ?? []).map(mapProduct)
    if (market) market.productCount = products.length
    return { market, products }
  },
}
