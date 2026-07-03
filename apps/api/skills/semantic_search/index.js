// SEMANTIC search — the vector-index read path.
//
// Calls MarketX /api/ai/search, which embeds the query and returns the nearest
// products / stores / markets by cosine similarity. Use this for open-ended,
// meaning-based discovery. For exact keyword titles or price filters, the
// `marketx` skill (raw ILIKE query) is the right tool instead.
//
// Auth: /api/ai/search is an internal endpoint gated by X-Dassah-Internal,
// whose shared secret is MARKETX_API_KEY on this side.
const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

// Map a raw embedding hit (entityType + stored metadata) into a card-ready shape.
function mapHit(r) {
  const m = r.metadata || {}
  // distance is cosine distance (0 = identical). Surface a 0..1 relevance score.
  const score = Number((1 - (r.distance ?? 0)).toFixed(3))

  if (r.entityType === 'PRODUCT') {
    return {
      kind:           'product',
      id:             m.entityId ?? r.entityId,
      name:           m.title,
      price:          m.price,
      discount:       m.discount ?? null,
      currency:       'NGN',
      description:    m.description ?? null,
      condition:      m.condition ?? null,
      rating:         m.averageRating ?? null,
      reviews:        m.totalReviews ?? 0,
      categories:     m.categories ?? [],
      inStock:        m.inStock ?? true,
      availableSizes: m.inStockSizes ?? [],
      seller:         m.sellerName ?? null,
      imageUrl:       m.imageUrl ?? null,
      slug:           m.slug,
      score,
    }
  }
  if (r.entityType === 'SELLER') {
    return {
      kind:     'store',
      id:       r.entityId,
      name:     m.storeName,
      slug:     m.storeSlug,
      location: m.locationLabel ?? m.city ?? null,
      state:    m.state ?? null,
      verified: !!m.isVerified,
      score,
    }
  }
  // SQUARE
  return {
    kind:     'market',
    id:       r.entityId,
    name:     m.name,
    slug:     m.slug,
    type:     m.type ?? null,
    location: [m.city, m.state].filter(Boolean).join(', ') || null,
    score,
  }
}

module.exports = {
  channels: ['buyer', 'seller'],
  description:
    'SEMANTIC search across MarketX using the vector index — finds products, stores, AND markets ' +
    'by meaning, not just literal keywords. Use this as the DEFAULT discovery tool: it surfaces ' +
    'relevant results even when the user\'s exact words are not in the listing (e.g. "modest wear" ' +
    'matches abaya/kaftan sellers, "something warm for harmattan" matches jackets). Optionally ' +
    'restrict to one type via `type`. For an exact title match or price-bounded lookup, use the ' +
    '`marketx` tool instead. The UI renders returned products and stores as cards automatically.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural-language search, e.g. "affordable ankara for a wedding"',
      },
      type: {
        type: 'string',
        enum: ['product', 'store', 'market'],
        description: 'Optional: restrict results to one entity type',
      },
      limit: { type: 'number', description: 'Max results (default 8, max 50)' },
    },
    required: ['query'],
  },

  async execute(inputs) {
    const { query, type, limit = 8 } = inputs
    const entityType =
      type === 'product' ? 'PRODUCT' :
      type === 'store'   ? 'SELLER'  :
      type === 'market'  ? 'SQUARE'  : undefined

    const res = await fetch(`${BASE_URL}/api/ai/search`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dassah-Internal': API_KEY },
      body:    JSON.stringify({ query, entityType, limit }),
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .catch(() => ({ data: [] }))

    const hits = (res.data ?? []).map(mapHit)
    return {
      products: hits.filter((h) => h.kind === 'product'),
      stores:   hits.filter((h) => h.kind === 'store'),
      markets:  hits.filter((h) => h.kind === 'market'),
      total:    hits.length,
    }
  },
}
