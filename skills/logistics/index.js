module.exports = {
  channels: ['buyer'],
  description: 'Calculates shipping costs from available carriers for an origin → destination route.',
  parameters: {
    type: 'object',
    properties: {
      origin:      { type: 'string', description: 'City or address where the shipment originates' },
      destination: { type: 'string', description: 'City or address for delivery' },
      weight_kg:   { type: 'number', description: 'Package weight in kilograms (default 1)' },
    },
    required: ['origin', 'destination'],
  },

  async execute(inputs) {
    const { origin, destination, weight_kg = 1 } = inputs

    const results = await Promise.allSettled([
      getGIGOptions({ origin, destination, weight_kg }),
      getDHLOptions({ origin, destination, weight_kg }),
    ])

    const options = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value)
      .sort((a, b) => a.cost - b.cost)

    if (!options.length) throw new Error('No shipping options available for this route')

    return { options, shipment_id: null }
  },
}

async function getGIGOptions({ origin, destination, weight_kg }) {
  const GIG_API_KEY = process.env.GIG_API_KEY
  const GIG_API_URL = process.env.GIG_API_URL
  if (!GIG_API_KEY || !GIG_API_URL) return []

  try {
    const response = await fetch(`${GIG_API_URL}/rates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GIG_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: origin, to: destination, weight: weight_kg }),
    })
    if (!response.ok) return []
    const data = await response.json()
    return (data.rates || []).map((rate) => ({
      carrier: 'GIG', method: rate.service_type, cost: rate.price,
      currency: 'NGN', estimatedDays: rate.estimated_days,
    }))
  } catch { return [] }
}

async function getDHLOptions({ origin, destination, weight_kg }) {
  if (!process.env.DHL_API_KEY) return []
  return [
    { carrier: 'DHL', method: 'Express Worldwide', cost: 12500, currency: 'NGN', estimatedDays: 4 },
  ]
}
