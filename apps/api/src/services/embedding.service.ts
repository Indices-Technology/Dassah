// Converts entity context objects into embedding vectors using OpenAI text-embedding-3-small.
// Also builds the source text and computes the SHA-256 content hash used for change detection.

import { createOpenAI } from '@ai-sdk/openai'
import { embed }        from 'ai'
import { createHash }   from 'crypto'

// ── Text builders ─────────────────────────────────────────────────────────────
// Each builder produces a rich, natural-language description of the entity.
// The richer and more specific the text, the better the similarity search.

export function buildProductText(p: Record<string, any>): string {
  const parts: string[] = []

  parts.push(`Product: ${p.title}`)
  if (p.description) parts.push(p.description)
  if (p.seller?.storeName) parts.push(`Sold by: ${p.seller.storeName}`)
  if (p.seller?.locationLabel) parts.push(`Seller location: ${p.seller.locationLabel}`)
  if (p.seller?.city)  parts.push(`City: ${p.seller.city}`)
  if (p.seller?.state) parts.push(`State: ${p.seller.state}`)

  if (p.price != null) parts.push(`Price: ₦${p.price}`)
  if (p.discount)      parts.push(`Discount: ${p.discount}%`)
  if (p.isDeal)        parts.push('This is a flash deal.')
  if (p.isThrift)      parts.push('Pre-loved / thrift item.')
  if (p.condition)     parts.push(`Condition: ${p.condition}`)

  if (p.categories?.length)  parts.push(`Categories: ${p.categories.join(', ')}`)
  if (p.tags?.length)        parts.push(`Tags: ${p.tags.join(', ')}`)

  if (p.variants?.length) {
    const sizes = p.variants.map((v: any) => v.size).join(', ')
    const inStock = p.variants.some((v: any) => v.stock > 0)
    parts.push(`Available sizes: ${sizes}`)
    parts.push(inStock ? 'In stock.' : 'Currently out of stock.')
  }

  if (p.square?.name) parts.push(`Listed in: ${p.square.name}`)
  if (p.averageRating) parts.push(`Rating: ${p.averageRating}/5 (${p.totalReviews} reviews)`)

  return parts.join('\n')
}

export function buildSellerText(s: Record<string, any>): string {
  const parts: string[] = []

  parts.push(`Seller: ${s.storeName}`)
  if (s.storeDescription) parts.push(s.storeDescription)
  if (s.locationLabel)    parts.push(`Location: ${s.locationLabel}`)
  if (s.city)             parts.push(`City: ${s.city}`)
  if (s.state)            parts.push(`State: ${s.state}`)

  if (s.podEnabled) {
    const zones = Array.isArray(s.podZones) ? s.podZones.join(', ') : ''
    parts.push(`Pay-on-delivery available${zones ? ` in: ${zones}` : ''}.`)
  }
  if (s.shipFromCity)  parts.push(`Ships from: ${s.shipFromCity}, ${s.shipFromState}`)
  if (s.isVerified)    parts.push('Verified seller.')
  if (s.isPremium)     parts.push('Premium seller.')
  if (s.averageRating) parts.push(`Rating: ${s.averageRating}/5 (${s.totalReviews} reviews)`)
  if (s.followersCount) parts.push(`Followers: ${s.followersCount}`)

  if (s.topCategories?.length) parts.push(`Top categories: ${s.topCategories.join(', ')}`)
  if (s.primarySquare?.name)   parts.push(`Primary market: ${s.primarySquare.name}`)

  return parts.join('\n')
}

export function buildSquareText(sq: Record<string, any>): string {
  const parts: string[] = []

  parts.push(`Market/Square: ${sq.name}`)
  if (sq.description) parts.push(sq.description)
  parts.push(`Type: ${sq.type === 'GEOGRAPHIC' ? 'Physical market' : 'Online category market'}`)

  if (sq.city)            parts.push(`City: ${sq.city}`)
  if (sq.state)           parts.push(`State: ${sq.state}`)
  if (sq.physicalAddress) parts.push(`Address: ${sq.physicalAddress}`)
  if (sq.latitude && sq.longitude) {
    parts.push(`GPS: ${sq.latitude}, ${sq.longitude}`)
  }

  if (sq.memberCount)   parts.push(`${sq.memberCount} sellers.`)
  if (sq.followerCount) parts.push(`${sq.followerCount} followers.`)
  if (sq.topCategories?.length) parts.push(`Top categories: ${sq.topCategories.join(', ')}`)

  return parts.join('\n')
}

// ── Core embedding logic ──────────────────────────────────────────────────────

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export interface EmbedResult {
  vector:      number[]
  contentHash: string
  text:        string
}

export async function embedText(text: string): Promise<EmbedResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const model = createOpenAI({ apiKey }).embedding('text-embedding-3-small')

  const { embedding } = await embed({ model, value: text })

  return {
    vector:      embedding,
    contentHash: hashText(text),
    text,
  }
}

type EntityType = 'PRODUCT' | 'SELLER' | 'SQUARE'

export async function embedEntity(
  type:   EntityType,
  entity: Record<string, any>,
): Promise<EmbedResult> {
  let text: string
  if      (type === 'PRODUCT') text = buildProductText(entity)
  else if (type === 'SELLER')  text = buildSellerText(entity)
  else                          text = buildSquareText(entity)

  return embedText(text)
}
