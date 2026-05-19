const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

module.exports = {
  channels: ['seller'],
  description: "Updates a seller's product price or inventory level on MarketX.",
  parameters: {
    type: 'object',
    properties: {
      action:    { type: 'string', enum: ['update_price', 'update_inventory'], description: 'Operation to perform' },
      productId: { type: 'string', description: 'MarketX product ID' },
      price:     { type: 'number', description: 'New price (required for update_price)' },
      inventory: { type: 'number', description: 'New stock count (required for update_inventory)' },
    },
    required: ['action', 'productId'],
  },

  async execute(inputs, context) {
    const { action, productId, price, inventory } = inputs
    const userToken = context?.userToken

    if (!userToken) throw new Error('Store management requires an authenticated session.')

    const headers = {
      'X-API-Key': API_KEY,
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    }

    if (action === 'update_price') {
      const res = await fetch(`${BASE_URL}/api/commerce/products/${productId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ price }),
      })
      if (!res.ok) throw new Error(`Price update failed: ${res.status}`)
      return { success: true, message: `Price updated to ₦${price}` }
    }

    if (action === 'update_inventory') {
      const res = await fetch(`${BASE_URL}/api/commerce/products/${productId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ inventory: { available: inventory } }),
      })
      if (!res.ok) throw new Error(`Inventory update failed: ${res.status}`)
      return { success: true, message: `Inventory updated to ${inventory} units` }
    }

    throw new Error('Invalid action. Supported: update_price, update_inventory')
  },
}
