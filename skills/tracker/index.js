const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

module.exports = {
  channels: ['buyer', 'seller'],
  description: 'Checks shipping status, current location, and estimated delivery for an order.',
  parameters: {
    type: 'object',
    properties: {
      trackingNumber: { type: 'string', description: "Carrier's tracking number" },
      orderId:        { type: 'string', description: 'MarketX order ID (if tracking number unknown)' },
    },
  },

  async execute(inputs, context) {
    const { trackingNumber, orderId } = inputs
    const userToken = context?.userToken

    const headers = {
      'X-API-Key': API_KEY,
      ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
    }

    if (trackingNumber) {
      const res = await fetch(`${BASE_URL}/api/commerce/shipping/track/${trackingNumber}`, { headers })
      if (!res.ok) throw new Error(`Tracking lookup failed: ${res.status}`)
      const data = await res.json()
      return {
        trackingNumber,
        status:            data.status,
        carrier:           data.carrier,
        estimatedDelivery: data.estimatedDelivery,
        events:            data.events ?? [],
      }
    }

    if (orderId) {
      const res = await fetch(`${BASE_URL}/api/commerce/orders/${orderId}`, { headers })
      if (!res.ok) throw new Error(`Order lookup failed: ${res.status}`)
      const body = await res.json()
      const order = body.data ?? body
      return {
        orderId,
        status:         order.status,
        trackingNumber: order.trackingNumber,
        items:          order.orderItem,
        total:          order.total,
        trackingStatus: order.shipping?.status,
      }
    }

    throw new Error('Provide either trackingNumber or orderId.')
  },
}
