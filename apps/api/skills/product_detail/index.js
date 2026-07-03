const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

module.exports = {
  channels: ['buyer', 'seller'],
  description:
    'Fetch the FULL detail of a single MarketX product by its slug — full description, condition, ' +
    'every size/variant with live stock and price, categories, tags, rating & review count, sold ' +
    'count, and seller reputation & delivery options. Use this whenever a user asks about the ' +
    'features, specifics, available sizes, stock, or details of a particular product (e.g. after a ' +
    'search surfaces it, or a message contains "slug: <value>"). Always prefer this over the raw ' +
    'search result when answering detailed questions about one product — the search result only ' +
    'carries summary fields.',
  parameters: {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'Product slug from a prior search result, e.g. "nike-air-max"',
      },
    },
    required: ['slug'],
  },

  async execute(inputs, context) {
    const { slug } = inputs
    const userToken = context?.userToken
    const headers = {
      'X-API-Key': API_KEY,
      ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
    }

    const res = await fetch(
      `${BASE_URL}/api/commerce/products/by-slug/${encodeURIComponent(slug)}`,
      { headers },
    )
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)

    const p = res?.data ?? res
    if (!p || !p.id) return { found: false, slug }

    const variants = (p.variants ?? []).map((v) => ({
      size:    v.size,
      stock:   v.stock,
      price:   v.price ?? p.price,
      inStock: v.stock > 0,
    }))

    return {
      found:          true,
      id:             p.id,
      name:           p.title,
      slug:           p.slug,
      description:    p.description ?? null,
      price:          p.price,
      discount:       p.discount ?? null,
      currency:       'NGN',
      condition:      p.condition ?? null,
      isDeal:         p.isDeal ?? false,
      isThrift:       p.isThrift ?? false,
      rating:         p.averageRating ?? null,
      reviews:        p.totalReviews ?? 0,
      soldCount:      p.soldCount ?? 0,
      categories:     (p.category ?? []).map((c) => c.category?.name).filter(Boolean),
      tags:           (p.tags ?? []).map((t) => t.tag?.name).filter(Boolean),
      variants,
      inStock:        variants.length ? variants.some((v) => v.inStock) : true,
      availableSizes: variants.filter((v) => v.inStock).map((v) => v.size),
      images:         (p.media ?? []).map((m) => m.url),
      seller: {
        name:          p.seller?.store_name,
        slug:          p.seller?.store_slug,
        verified:      !!p.seller?.is_verified,
        premium:       !!p.seller?.isPremium,
        rating:        p.seller?.averageRating ?? null,
        location:      p.seller?.locationLabel ?? p.seller?.store_location ?? null,
        payOnDelivery: !!p.seller?.pod_enabled,
      },
      square:     p.square ? { name: p.square.name, slug: p.square.slug } : null,
      productUrl: `${BASE_URL}/product/${p.slug}`,
    }
  },
}
