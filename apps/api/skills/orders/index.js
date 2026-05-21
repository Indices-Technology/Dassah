const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

module.exports = {
  channels: ['buyer'],
  description: 'Lists all orders for the current user, or fetches full details of a specific order including items, status, and payment info.',
  parameters: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'Specific order ID to look up. Omit to list all orders.' },
      limit:   { type: 'number', description: 'Max orders to return when listing (default 10)' },
    },
  },

  async execute(inputs, context) {
    const { orderId, limit = 10 } = inputs
    const userToken = context?.userToken
    if (!userToken) throw new Error('Order history requires an authenticated session.')

    const headers = {
      'X-API-Key':   API_KEY,
      Authorization: `Bearer ${userToken}`,
    }

    if (orderId) {
      const res = await fetch(`${BASE_URL}/api/commerce/orders/${orderId}`, { headers })
      if (!res.ok) throw new Error(`Order not found: ${res.status}`)
      const body = await res.json()
      const o = body.data ?? body
      return {
        id:            o.id,
        status:        o.status,
        paymentStatus: o.paymentStatus,
        total:         o.total,
        currency:      'NGN',
        items: (o.orderItem ?? []).map((i) => ({
          name:     i.variant?.product?.name || i.variant?.product?.title,
          quantity: i.quantity,
          price:    i.price,
          imageUrl: i.variant?.product?.media?.[0]?.url,
        })),
        createdAt:     o.createdAt,
        trackingNumber: o.trackingNumber,
      }
    }

    const params = new URLSearchParams({ limit: String(limit), offset: '0' })
    const res = await fetch(`${BASE_URL}/api/commerce/orders?${params}`, { headers })
    if (!res.ok) throw new Error(`Failed to fetch orders: ${res.status}`)
    const body = await res.json()
    const orders = (body.data ?? []).map((o) => ({
      id:            o.id,
      status:        o.status,
      paymentStatus: o.paymentStatus,
      total:         o.total,
      currency:      'NGN',
      itemCount:     o._count?.orderItem ?? o.orderItem?.length ?? 0,
      createdAt:     o.createdAt,
    }))
    return { orders, total: orders.length }
  },
}
