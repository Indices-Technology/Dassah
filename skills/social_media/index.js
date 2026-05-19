module.exports = {
  channels: ['seller'],
  description: 'Sends a WhatsApp broadcast or posts to Instagram on behalf of the seller.',
  parameters: {
    type: 'object',
    properties: {
      action:    { type: 'string', enum: ['broadcast', 'post'], description: 'broadcast = WhatsApp, post = Instagram' },
      platform:  { type: 'string', enum: ['whatsapp', 'instagram'] },
      message:   { type: 'string', description: 'Message or caption to send' },
      recipient: { type: 'string', description: 'Recipient phone/handle (WhatsApp only)' },
    },
    required: ['action', 'platform', 'message'],
  },

  async execute(inputs) {
    const { action, message, platform, recipient } = inputs

    if (action === 'broadcast' && platform === 'whatsapp') {
      const res = await fetch(`${process.env.WHATSAPP_API_URL}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: recipient, type: 'text', text: { body: message } }),
      })
      if (!res.ok) throw new Error(`WhatsApp broadcast failed: ${res.status}`)
      return { success: true, message: 'WhatsApp broadcast sent' }
    }

    if (action === 'post' && platform === 'instagram') {
      const res = await fetch(`${process.env.INSTAGRAM_API_URL}/media`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.INSTAGRAM_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: message, media_type: 'IMAGE' }),
      })
      if (!res.ok) throw new Error(`Instagram post failed: ${res.status}`)
      return { success: true, message: 'Instagram post created' }
    }

    throw new Error('Invalid action or platform. Use broadcast/whatsapp or post/instagram.')
  },
}
