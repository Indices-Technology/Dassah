const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

module.exports = {
  channels: ['buyer', 'seller'],
  description: "Checks the user's MarketX wallet balance and recent transactions.",
  parameters: {
    type: 'object',
    properties: {
      includeTransactions: {
        type: 'boolean',
        description: 'Include recent transaction history (default false)',
      },
    },
  },

  async execute(inputs, context) {
    const { includeTransactions = false } = inputs
    const userToken = context?.userToken
    if (!userToken) throw new Error('Wallet access requires an authenticated session.')

    const headers = {
      'X-API-Key':   API_KEY,
      Authorization: `Bearer ${userToken}`,
    }

    const res = await fetch(`${BASE_URL}/api/commerce/wallet`, { headers })
    if (!res.ok) throw new Error(`Wallet fetch failed: ${res.status}`)
    const body = await res.json()
    const w = body.data ?? body

    const result = {
      balance:        w.balance ?? 0,
      pendingBalance: w.pending_balance ?? w.pendingBalance ?? 0,
      currency:       'NGN',
    }

    if (includeTransactions) {
      const txRes = await fetch(`${BASE_URL}/api/commerce/wallet/transactions`, { headers })
      if (txRes.ok) {
        const txBody = await txRes.json()
        result.transactions = (txBody.data ?? []).slice(0, 10).map((t) => ({
          type:      t.type,
          amount:    t.amount,
          reference: t.reference,
          createdAt: t.createdAt,
        }))
      }
    }

    return result
  },
}
