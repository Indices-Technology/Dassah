const { api, resolveStore } = require('../_lib')

// Maps a friendly timeframe to the endpoint's `days` window (clamped 7–90 server-side).
const DAYS = { today: 7, week: 7, month: 30, all: 90 }

module.exports = {
  channels: ['seller'],
  description:
    "Get the seller's store analytics — revenue, orders, units sold, product views, " +
    'impressions, a daily time-series chart, and a top-products breakdown. Use this for ' +
    'any "how is my store doing / sales / performance / best sellers" question.',
  parameters: {
    type: 'object',
    properties: {
      timeframe: {
        type: 'string',
        enum: ['today', 'week', 'month', 'all'],
        description: 'Time window for the report (default: week).',
      },
    },
  },

  async execute(inputs, context) {
    const { timeframe = 'week' } = inputs
    const { slug } = await resolveStore(context)
    const days = DAYS[timeframe] ?? 7

    // GET /api/seller/analytics/{storeSlug}?days=N → { success, data: { summary, chart, topProducts } }
    const body = await api(
      `/api/seller/analytics/${encodeURIComponent(slug)}?days=${days}`,
      { userToken: context?.userToken },
    )
    const data = body.data ?? {}
    const summary = data.summary ?? {}

    return {
      storeSlug: slug,
      timeframe,
      days,
      summary: {
        revenue:       summary.revenue ?? 0,
        orders:        summary.orders ?? 0,
        unitsSold:     summary.unitsSold ?? 0,
        views:         summary.views ?? 0,
        impressions:   summary.impressions ?? 0,
        affiliatePaid: summary.affiliatePaid ?? 0,
        // conversion = orders / views, guarded
        conversionRate:
          summary.views > 0 ? +((summary.orders / summary.views) * 100).toFixed(2) : 0,
      },
      chart:       data.chart ?? [],       // [{ date, revenue, orders, unitsSold, views, impressions }]
      topProducts: data.topProducts ?? [], // [{ productId, title, slug, thumbnail, revenue, unitsSold, ... }]
      currency:    'NGN',
    }
  },
}
