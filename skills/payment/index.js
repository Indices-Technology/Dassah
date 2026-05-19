const crypto = require('crypto')

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY
const UI_BASE_URL = process.env.NUXT_PUBLIC_BASE_URL ?? 'http://localhost:3001'

module.exports = {
  channels: ['buyer'],
  description: 'Generates a Paystack payment link and a one-time approval token for a product purchase. Always confirm with the user before calling this.',
  parameters: {
    type: 'object',
    properties: {
      productId:   { type: 'string', description: 'MarketX product ID' },
      productName: { type: 'string', description: 'Product display name' },
      price:       { type: 'number', description: 'Numeric price in the given currency' },
      currency:    { type: 'string', description: 'Currency code, e.g. NGN (default NGN)' },
    },
    required: ['productId', 'productName', 'price'],
  },

  async execute(inputs, context) {
    const { productId, productName, price, currency = 'NGN' } = inputs
    const userEmail = context?.email ?? 'customer@marketx.com'

    if (!PAYSTACK_SECRET_KEY) throw new Error('Payment configuration missing on server.')

    const approvalToken = crypto.randomBytes(16).toString('hex')
    const amountKobo = Math.round(price * 100)

    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: userEmail,
        amount: amountKobo,
        currency,
        callback_url: `${UI_BASE_URL}/checkout/verify?token=${approvalToken}`,
        metadata: { productId, productName, approvalToken },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Failed to initialize payment: ${err}`)
    }

    const data = await res.json()
    return {
      paymentUrl:    data.data.authorization_url,
      reference:     data.data.reference,
      approvalToken,
      message:       'Payment link generated. Awaiting explicit user approval.',
    }
  },
}
