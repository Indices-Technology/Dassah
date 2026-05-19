const BASE_URL = process.env.MARKETX_API_URL
const API_KEY  = process.env.MARKETX_API_KEY

module.exports = {
  channels: ['seller'],
  description: "Retrieves the authenticated seller's sales metrics, revenue, and order counts.",
  parameters: {
    type: 'object',
    properties: {
      timeframe: {
        type: 'string',
        enum: ['today', 'week', 'month', 'all'],
        description: 'Time window for the report (default: week)',
      },
    },
  },

  async execute(inputs, context) {
    const { timeframe = 'week' } = inputs
    const userToken = context?.userToken

    if (!userToken) throw new Error('Seller analytics requires an authenticated session.')

    const headers = { 'X-API-Key': API_KEY, Authorization: `Bearer ${userToken}` }

    // Step 1: resolve seller's storeSlug from profile
    const profileRes = await fetch(`${BASE_URL}/api/profile`, { headers })
    if (!profileRes.ok) throw new Error(`Failed to load profile: ${profileRes.status}`)
    const profileBody = await profileRes.json()
    const storeSlug = profileBody.data?.sellerProfile?.store_slug
    if (!storeSlug) throw new Error('No seller store found for this account.')

    // Step 2: date range
    const now = new Date()
    const startDate = new Date()
    if (timeframe === 'today') startDate.setHours(0, 0, 0, 0)
    else if (timeframe === 'week') startDate.setDate(startDate.getDate() - 7)
    else if (timeframe === 'month') startDate.setMonth(startDate.getMonth() - 1)
    else startDate.setFullYear(2000)

    // Step 3: fetch seller orders (response: { data: { orders, total, limit, offset } })
    const ordersRes = await fetch(
      `${BASE_URL}/api/commerce/orders/seller?storeSlug=${encodeURIComponent(storeSlug)}&limit=100`,
      { headers },
    )
    if (!ordersRes.ok) throw new Error(`MarketX seller orders failed: ${ordersRes.status}`)
    const ordersBody = await ordersRes.json()
    const allOrders = ordersBody.data?.orders ?? []

    const orders = allOrders.filter((o) => {
      const d = new Date(o.created_at || o.createdAt)
      return d >= startDate && d <= now
    })

    // Revenue is already in NGN (sellerBreakdown.net), not kobo
    const totalRevenue = orders.reduce((s, o) => s + (o.sellerBreakdown?.net ?? 0), 0)
    const totalOrders  = orders.length

    // Step 4: wallet (response: { data: { wallet: { balance, pending_balance } } })
    const walletRes = await fetch(`${BASE_URL}/api/commerce/wallet`, { headers })
    let walletBalance = null
    if (walletRes.ok) {
      const walletBody = await walletRes.json()
      const walletData = walletBody.data?.wallet ?? walletBody.data ?? {}
      walletBalance = (walletData.balance ?? 0) / 100
    }

    return {
      period:            timeframe,
      storeSlug,
      startDate:         startDate.toISOString(),
      endDate:           now.toISOString(),
      totalRevenue,
      totalOrders,
      pendingOrders:     orders.filter((o) => o.status === 'PENDING').length,
      completedOrders:   orders.filter((o) => o.status === 'COMPLETED').length,
      walletBalance,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      currency:          'NGN',
    }
  },
}
