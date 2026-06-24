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

module.exports = {
  channels: ['buyer', 'seller'],
  description:
    "View a specific MarketX store and its products. Use this when a user wants to browse a " +
    "particular store — e.g. after a search surfaces a store like \"Grandeur Wears and Abaya\", " +
    "or when a message contains 'storeSlug: <value>'. Pass the store's slug (preferred) or storeId " +
    "from the prior search result. Returns the store profile and its published products.",
  parameters: {
    type: 'object',
    properties: {
      slug:    { type: 'string', description: 'Store slug, e.g. "grandeur-wears-and-abaya"' },
      storeId: { type: 'string', description: 'Store / sellerProfile id (alternative to slug)' },
      limit:   { type: 'number', description: 'Max products to return (default 12)' },
    },
  },

  async execute(inputs, context) {
    const { slug, storeId, limit = 12 } = inputs
    const userToken = context?.userToken
    const headers = {
      'X-API-Key': API_KEY,
      ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
    }

    // Store profile (by slug) — name, logo, description, verification.
    let store = null
    if (slug) {
      const pr = await fetch(`${BASE_URL}/api/seller/by-slug/${encodeURIComponent(slug)}`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
      const d = pr?.data ?? pr
      if (d && (d.id || d.store_name)) {
        store = {
          id:          d.id,
          name:        d.store_name,
          slug:        d.store_slug || slug,
          description: d.store_description ?? null,
          logo:        d.store_logo ?? null,
          location:    d.store_location ?? null,
          verified:    !!d.is_verified,
          profileUrl:  `${BASE_URL}/sellers/profile/${d.store_slug || slug}`,
        }
      }
    }

    // Products for this store.
    const sid = storeId || store?.id
    let products = []
    if (sid) {
      const params = new URLSearchParams({ limit: String(limit), status: 'PUBLISHED', sellerId: sid })
      const prods = await fetch(`${BASE_URL}/api/commerce/products?${params}`, { headers })
        .then((r) => (r.ok ? r.json() : { data: {} }))
        .catch(() => ({ data: {} }))
      products = (prods.data?.products ?? []).map(mapProduct)
    }

    if (store) store.productCount = products.length
    return { store, products }
  },
}
