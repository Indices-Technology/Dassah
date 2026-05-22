// Manages the persistent UserAIProfile for each user.
//
// Flow:
//   1. getProfile  — Redis cache (5 min TTL) → MarketX API on miss
//   2. upsertProfile — write to MarketX, bust cache, background re-extract
//   3. extractAndUpdate — called post-turn to pick up new preferences from the conversation

import { redisClient }   from './session'
import { internalClient, type UserAIProfileData } from '../lib/internal'

const CACHE_PREFIX = 'ai_profile:'
const CACHE_TTL    = 300  // 5 minutes

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function fromCache(userId: string): Promise<UserAIProfileData | null> {
  try {
    const raw = await redisClient.get(`${CACHE_PREFIX}${userId}`)
    return raw ? (JSON.parse(raw) as UserAIProfileData) : null
  } catch {
    return null
  }
}

async function toCache(userId: string, profile: UserAIProfileData): Promise<void> {
  try {
    await redisClient.set(
      `${CACHE_PREFIX}${userId}`,
      JSON.stringify(profile),
      'EX',
      CACHE_TTL,
    )
  } catch {}
}

async function bustCache(userId: string): Promise<void> {
  try {
    await redisClient.del(`${CACHE_PREFIX}${userId}`)
  } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────

export const userProfileService = {
  /** Returns the user's AI profile. Cache-first, falls back to MarketX API. */
  async getProfile(userId: string): Promise<UserAIProfileData | null> {
    const cached = await fromCache(userId)
    if (cached) return cached

    try {
      const profile = await internalClient.getProfile(userId)
      if (profile) await toCache(userId, profile)
      return profile
    } catch (err) {
      console.error('[user-profile] getProfile failed:', (err as Error).message)
      return null
    }
  },

  /** Upserts and caches the profile. */
  async upsertProfile(
    userId: string,
    data:   Partial<UserAIProfileData>,
  ): Promise<UserAIProfileData | null> {
    try {
      const updated = await internalClient.upsertProfile(userId, data)
      await toCache(userId, updated)
      return updated
    } catch (err) {
      console.error('[user-profile] upsertProfile failed:', (err as Error).message)
      return null
    }
  },

  /**
   * Fires after every AI turn. Scans the conversation for new explicit preferences
   * ("I'm 6'1", I wear size 43") and merges them into the profile.
   * Non-blocking — does not affect turn latency.
   */
  extractAndUpdate(userId: string, userMessage: string, assistantResponse: string): void {
    // Run extraction in the background
    setImmediate(async () => {
      try {
        const current = await userProfileService.getProfile(userId)

        const updates = extractPreferences(userMessage, current)
        if (!updates) return

        await userProfileService.upsertProfile(userId, updates)
        await bustCache(userId)
      } catch (err) {
        console.error('[user-profile] extractAndUpdate failed:', (err as Error).message)
      }
    })
  },
}

// ── Preference extractor ──────────────────────────────────────────────────────
// Simple regex-based pass. Replace with an AI extraction call if needed later.

function extractPreferences(
  text:    string,
  current: UserAIProfileData | null,
): Partial<UserAIProfileData> | null {
  const measurements: Record<string, unknown> = {
    ...(current?.measurements as Record<string, unknown> ?? {}),
  }

  let changed = false

  // Height — e.g. "I'm 6'1"", "I'm 183cm"
  const height = text.match(/i['']?m\s+(\d+['′]?\s*\d*["″]?(?:cm|ft)?)/i)
  if (height) { measurements.height = height[1].trim(); changed = true }

  // Shoe size — e.g. "size 43", "shoe size 42", "wear a size 10"
  const shoe = text.match(/(?:shoe\s*size|wear(?:s)?\s+(?:a\s+)?size|size)\s*(\d+)/i)
  if (shoe) { measurements.shoeSize = shoe[1]; changed = true }

  // Clothing size — e.g. "wear XL", "size M", "I'm a medium"
  const clothing = text.match(/(?:wear\s+(?:a\s+)?|i['']?m\s+a?\s*)([XxSsLlMm]{1,3})\b/)
  if (clothing) { measurements.clothingSize = clothing[1].toUpperCase(); changed = true }

  // Waist — e.g. "32 inch waist", "waist 34"
  const waist = text.match(/(?:waist\s+(\d+)|(\d+)\s*(?:inch)?\s*waist)/i)
  if (waist) { measurements.waist = waist[1] ?? waist[2]; changed = true }

  if (!changed) return null

  return { measurements }
}

// ── Format profile for system prompt injection ────────────────────────────────

export function formatProfileForPrompt(profile: UserAIProfileData | null): string {
  if (!profile) return ''

  const lines: string[] = ['[User Profile]']

  const m = profile.measurements as Record<string, unknown> | undefined
  if (m && Object.keys(m).length) {
    const parts = []
    if (m.height)       parts.push(`Height: ${m.height}`)
    if (m.weight)       parts.push(`Weight: ${m.weight}`)
    if (m.shoeSize)     parts.push(`Shoe size: ${m.shoeSize}`)
    if (m.clothingSize) parts.push(`Clothing size: ${m.clothingSize}`)
    if (m.waist)        parts.push(`Waist: ${m.waist}`)
    if (m.chest)        parts.push(`Chest: ${m.chest}`)
    if (parts.length)   lines.push(`Measurements: ${parts.join(', ')}`)
  }

  const p = profile.preferences as Record<string, unknown> | undefined
  if (p && Object.keys(p).length) {
    if (p.style)             lines.push(`Style: ${p.style}`)
    if (p.budget)            lines.push(`Budget: ${p.budget}`)
    if (p.brands)            lines.push(`Preferred brands: ${Array.isArray(p.brands) ? p.brands.join(', ') : p.brands}`)
    if (p.colors)            lines.push(`Preferred colors: ${Array.isArray(p.colors) ? p.colors.join(', ') : p.colors}`)
    if (p.preferredSellers)  lines.push(`Preferred sellers: ${Array.isArray(p.preferredSellers) ? p.preferredSellers.join(', ') : p.preferredSellers}`)
  }

  const s = profile.signals as Record<string, unknown> | undefined
  if (s && Object.keys(s).length) {
    if (s.topCategories)      lines.push(`Shops often in: ${Array.isArray(s.topCategories) ? s.topCategories.join(', ') : s.topCategories}`)
    if (s.preferredLocations) lines.push(`Preferred locations: ${Array.isArray(s.preferredLocations) ? s.preferredLocations.join(', ') : s.preferredLocations}`)
  }

  return lines.length > 1 ? lines.join('\n') : ''
}
