import path from 'path'
import type { Tool } from '@anthropic-ai/sdk/resources/messages'

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Record<string, Tool> = {
  marketx: {
    name: 'marketx',
    description: 'Searches the MarketX platform for products matching a query, category, or price limit.',
    input_schema: {
      type: 'object',
      properties: {
        query:    { type: 'string', description: 'Search term (e.g. "Nike shoes", "laptop")' },
        limit:    { type: 'number', description: 'Max results to return (default 5)' },
        sellerId: { type: 'string', description: 'Restrict results to a specific seller' },
      },
      required: ['query'],
    },
  },

  payment: {
    name: 'payment',
    description: 'Generates a Paystack payment link and an approval token for a product purchase.',
    input_schema: {
      type: 'object',
      properties: {
        productId:   { type: 'string', description: 'MarketX product ID' },
        productName: { type: 'string', description: 'Product display name' },
        price:       { type: 'number', description: 'Numeric price in the given currency' },
        currency:    { type: 'string', description: 'Currency code, e.g. NGN (default NGN)' },
      },
      required: ['productId', 'productName', 'price'],
    },
  },

  logistics: {
    name: 'logistics',
    description: 'Calculates shipping costs from available carriers for an origin → destination route.',
    input_schema: {
      type: 'object',
      properties: {
        origin:      { type: 'string', description: 'City or address where the shipment originates' },
        destination: { type: 'string', description: 'City or address for delivery' },
        weight_kg:   { type: 'number', description: 'Package weight in kilograms (default 1)' },
      },
      required: ['origin', 'destination'],
    },
  },

  tracker: {
    name: 'tracker',
    description: 'Checks shipping status, current location, and estimated delivery for an order.',
    input_schema: {
      type: 'object',
      properties: {
        trackingNumber: { type: 'string', description: "Carrier's tracking number" },
        orderId:        { type: 'string', description: 'MarketX order ID (if tracking number unknown)' },
      },
    },
  },

  dispute: {
    name: 'dispute',
    description: 'Opens a dispute or refund request for a specific order.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'MarketX order ID to dispute' },
        reason:   { type: 'string', description: "User's reason for opening the dispute" },
      },
      required: ['order_id', 'reason'],
    },
  },

  seller_analytics: {
    name: 'seller_analytics',
    description: "Retrieves the authenticated seller's sales metrics, revenue, and order counts.",
    input_schema: {
      type: 'object',
      properties: {
        timeframe: {
          type: 'string',
          enum: ['today', 'week', 'month', 'all'],
          description: 'Time window for the report (default: week)',
        },
      },
    },
  },

  store_management: {
    name: 'store_management',
    description: "Updates a seller's product price or inventory level on MarketX.",
    input_schema: {
      type: 'object',
      properties: {
        action:    { type: 'string', enum: ['update_price', 'update_inventory'], description: 'Operation to perform' },
        productId: { type: 'string', description: 'MarketX product ID' },
        price:     { type: 'number', description: 'New price (required for update_price)' },
        inventory: { type: 'number', description: 'New stock count (required for update_inventory)' },
      },
      required: ['action', 'productId'],
    },
  },

  social_media: {
    name: 'social_media',
    description: 'Sends a WhatsApp broadcast or posts to Instagram on behalf of the seller.',
    input_schema: {
      type: 'object',
      properties: {
        action:    { type: 'string', enum: ['broadcast', 'post'], description: 'broadcast = WhatsApp, post = Instagram' },
        platform:  { type: 'string', enum: ['whatsapp', 'instagram'] },
        message:   { type: 'string', description: 'Message or caption to send' },
        recipient: { type: 'string', description: 'Recipient phone/handle (WhatsApp only)' },
      },
      required: ['action', 'platform', 'message'],
    },
  },
}

const BUYER_TOOLS  = ['marketx', 'payment', 'logistics', 'tracker', 'dispute'] as const
const SELLER_TOOLS = ['store_management', 'seller_analytics', 'social_media', 'tracker', 'marketx'] as const

type Channel = 'dassai-web' | 'dassai-seller-web'

export function getTools(channel: Channel): Tool[] {
  const names = channel === 'dassai-seller-web' ? SELLER_TOOLS : BUYER_TOOLS
  return names.map((n) => TOOLS[n])
}

// ── Skill execution ───────────────────────────────────────────────────────────
// Dynamic require at call time = hot-swap: replace openclaw/skills/<name>/index.js
// and the next invocation picks up the new version without a server restart.

const SKILLS_DIR = path.join(__dirname, '../../../../openclaw/skills')

export async function executeSkill(
  name: string,
  args: Record<string, unknown>,
  context: { userToken: string },
): Promise<unknown> {
  const skillPath = path.join(SKILLS_DIR, name, 'index.js')
  try {
    delete require.cache[require.resolve(skillPath)]
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const skill = require(skillPath) as { execute: (i: unknown, c: unknown) => Promise<unknown> }
    return await skill.execute(args, context)
  } catch (err: any) {
    throw new Error(`Skill "${name}" failed: ${err.message}`)
  }
}
