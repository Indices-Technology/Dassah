const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

function mapProduct(p) {
  return {
    id:       p.id,
    name:     p.title || p.name,
    price:    p.price,
    discount: p.discount ?? null,
    currency: 'NGN',
    seller:   p.seller?.store_name,
    sellerId: p.sellerId,
    imageUrl: p.media?.[0]?.url,
    inStock:  !p.variants?.length || p.variants.some((v) => v.stock > 0),
    slug:     p.slug,
  }
}

function mapStore(s) {
  return {
    id:          s.id,
    name:        s.store_name,
    slug:        s.store_slug,
    description: s.store_description ?? null,
    logo:        s.store_logo ?? null,
    profileUrl:  `${BASE_URL}/sellers/profile/${s.store_slug}`,
  }
}

module.exports = {
  channels: ['buyer', 'seller'],
  description:
    'Search MarketX for products AND stores matching a query. Returns matching products, ' +
    'plus any stores/sellers whose name or description matches — so a query like "abaya" ' +
    'surfaces stores that sell abaya even when no product is literally titled "abaya". ' +
    'If products is empty but stores has results, recommend the store(s).',
  parameters: {
    type: 'object',
    properties: {
      query:    { type: 'string', description: 'Search term (e.g. "Nike shoes", "abaya")' },
      limit:    { type: 'number', description: 'Max products to return (default 5)' },
      sellerId: { type: 'string', description: 'Restrict products to a specific seller' },
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

    // Products — keyword search over title + description (supports sellerId filter).
    const pParams = new URLSearchParams({ limit: String(limit), status: 'PUBLISHED' })
    if (query) pParams.set('search', query)
    if (sellerId) pParams.set('sellerId', sellerId)
    const productsPromise = fetch(`${BASE_URL}/api/commerce/products?${pParams}`, { headers })
      .then((r) => (r.ok ? r.json() : { data: {} }))
      .then((b) => (b.data?.products ?? []).map(mapProduct))
      .catch(() => [])

    // Stores — global search matches store_name + store_description (finds "abaya" stores).
    // Skipped when scoped to a single seller.
    const storesPromise = query && !sellerId
      ? fetch(`${BASE_URL}/api/search?q=${encodeURIComponent(query)}&type=stores&limit=5`, { headers })
          .then((r) => (r.ok ? r.json() : { data: {} }))
          .then((b) => (b.data?.stores ?? []).map(mapStore))
          .catch(() => [])
      : Promise.resolve([])

    const [products, stores] = await Promise.all([productsPromise, storesPromise])
    return { products, stores, total: products.length }
  },
}
