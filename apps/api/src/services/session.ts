import Redis from 'ioredis'

// Redis client — shared by:
//   1. User session storage
//   2. BullMQ queue backend (shared with worker)
//   3. Redis pub/sub for worker → socket notifications

export const redisClient = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379', {
  maxRetriesPerRequest: null, // required by BullMQ
  lazyConnect: true,
})

redisClient.on('error', (err) => {
  console.error('[Redis] connection error:', err.message)
})

// ── Session store ─────────────────────────────────────────────────────────────

const SESSION_PREFIX = 'session:'
const TTL = parseInt(process.env.SESSION_TTL_SECONDS ?? '900', 10)

export interface UserSession {
  userId: string
  /** Current MarketX access token — synced on every connect/reconnect */
  marketxToken: string
  /** Refresh token for silent renewal when the access token expires */
  marketxRefreshToken?: string
  /** User's own AI provider config fetched from MarketX on connect. Null = use platform default. */
  userAIConfig?: { provider: 'anthropic' | 'openai'; model: string; apiKey: string } | null
  createdAt: string
}

export const sessionStore = {
  async get(userId: string): Promise<UserSession | null> {
    const raw = await redisClient.get(`${SESSION_PREFIX}${userId}`)
    return raw ? (JSON.parse(raw) as UserSession) : null
  },

  async set(userId: string, session: UserSession): Promise<void> {
    await redisClient.set(
      `${SESSION_PREFIX}${userId}`,
      JSON.stringify(session),
      'EX',
      TTL,
    )
  },

  async delete(userId: string): Promise<void> {
    await redisClient.del(`${SESSION_PREFIX}${userId}`)
  },

  async touch(userId: string): Promise<void> {
    await redisClient.expire(`${SESSION_PREFIX}${userId}`, TTL)
  },
}
