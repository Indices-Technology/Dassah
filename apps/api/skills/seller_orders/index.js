const { api, resolveStore, kobo } = require('../_lib')

// Seller-side order management: list incoming orders, view one, advance status,
// and ship (SHIPPED + tracking). Status transitions are guarded server-side:
//   PENDING → CONFIRMED | CANCELLED ; CONFIRMED → SHIPPED | CANCELLED ; SHIPPED → DELIVERED.

module.exports = {
  channels: ['seller'],
  description:
    "Manage the seller's incoming store orders: list them (optionally by status), view " +
    'one order in detail, confirm/cancel an order, or mark an order shipped with a ' +
    'tracking number. Use for any "my orders / fulfil / ship / order #X" request.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'get', 'update_status', 'ship'],
        description: 'Operation to perform (default: list).',
      },
      orderId:        { type: 'string', description: 'Order ID (required for get/update_status/ship).' },
      status:         { type: 'string', enum: ['CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'], description: 'New status for update_status.' },
      statusFilter:   { type: 'string', enum: ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'], description: 'Filter the list to one status.' },
      trackingNumber: { type: 'string', description: 'Tracking number (ship).' },
      shipper:        { type: 'string', description: 'Carrier name (ship, optional).' },
      limit:          { type: 'number', description: 'Max orders to list (default 20).' },
    },
  },

  async execute(inputs, context) {
    const { action = 'list' } = inputs
    const userToken = context?.userToken

    // ── list ──────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const { slug } = await resolveStore(context)
      const limit = inputs.limit || 20
      const body = await api(
        `/api/commerce/orders/seller?storeSlug=${encodeURIComponent(slug)}&limit=${limit}`,
        { userToken },
      )
      let orders = body.data?.orders ?? []
      if (inputs.statusFilter) orders = orders.filter((o) => o.status === inputs.statusFilter)
      return {
        count: orders.length,
        orders: orders.map((o) => ({
          id:            o.id,
          status:        o.status,
          paymentStatus: o.paymentStatus,
          total:         kobo(o.totalAmount),                 // naira
          sellerNet:     o.sellerBreakdown?.net ?? null,      // seller earnings (NGN)
          itemCount:     o.orderItem?.length ?? o._count?.orderItem ?? 0,
          createdAt:     o.created_at,
        })),
        currency: 'NGN',
      }
    }

    if (!inputs.orderId) throw new Error('That action needs an orderId.')
    const orderId = inputs.orderId

    // ── get ───────────────────────────────────────────────────────────────────
    if (action === 'get') {
      const body = await api(`/api/commerce/orders/${orderId}`, { userToken })
      const o = body.data ?? body
      return {
        id:            o.id,
        status:        o.status,
        paymentStatus: o.paymentStatus,
        total:         kobo(o.totalAmount),
        sellerNet:     o.sellerBreakdown?.net ?? null,
        buyer:         o.name ?? null,
        address:       [o.address, o.county, o.country].filter(Boolean).join(', ') || null,
        trackingNumber: o.trackingNumber ?? null,
        createdAt:     o.created_at,
        items: (o.orderItem ?? []).map((i) => ({
          title:    i.variant?.product?.title,
          size:     i.variant?.size,
          quantity: i.quantity,
          price:    kobo(i.price),
          imageUrl: i.variant?.product?.media?.[0]?.url ?? null,
        })),
        currency: 'NGN',
      }
    }

    // ── update_status / ship ──────────────────────────────────────────────────
    if (action === 'update_status' || action === 'ship') {
      const status = action === 'ship' ? 'SHIPPED' : inputs.status
      if (!status) throw new Error('update_status needs a status.')
      const payload = {
        status,
        ...(inputs.trackingNumber ? { trackingNumber: inputs.trackingNumber } : {}),
        ...(inputs.shipper ? { shipper: inputs.shipper } : {}),
      }
      await api(`/api/commerce/orders/${orderId}/status`, { userToken, method: 'PATCH', body: payload })
      return {
        success: true,
        message: `Order ${orderId} → ${status}${inputs.trackingNumber ? ` (tracking ${inputs.trackingNumber})` : ''}.`,
      }
    }

    throw new Error(`Unknown action: ${action}`)
  },
}
