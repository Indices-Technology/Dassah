// Calls the Dassah API itself (internal route) to open a dispute on MarketX
const DASSAH_API_URL = process.env.DASSAH_API_URL ?? 'http://localhost:4000'

module.exports = {
  channels: ['buyer'],
  description: 'Opens a dispute or refund request for a specific order.',
  parameters: {
    type: 'object',
    properties: {
      order_id: { type: 'string', description: 'MarketX order ID to dispute' },
      reason:   { type: 'string', description: "User's reason for opening the dispute" },
    },
    required: ['order_id', 'reason'],
  },

  async execute(inputs) {
    const { order_id, reason } = inputs

    const res = await fetch(`${DASSAH_API_URL}/api/orders/${order_id}/dispute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': process.env.INTERNAL_API_KEY ?? '',
      },
      body: JSON.stringify({ reason }),
    })

    if (res.status === 404) return { status: 'not_found', message: "I couldn't find that order.", dispute_id: null }
    if (res.status === 409) return { status: 'already_disputed', message: 'A dispute is already open for this order.', dispute_id: null }
    if (!res.ok) throw new Error(`Dispute failed: ${res.status}`)

    const data = await res.json()
    return {
      dispute_id: data.id,
      status:     'opened',
      message:    `Dispute opened for order ${order_id}. Our team will review within 48 hours.`,
    }
  },
}
