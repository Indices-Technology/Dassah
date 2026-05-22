// HTTP client for Dassah → MarketX internal-only endpoints.
// All requests are authenticated with X-Dassah-Internal header.

const BASE = process.env.MARKETX_API_URL ?? ''
const KEY  = process.env.MARKETX_API_KEY  ?? ''

const INTERNAL_HEADERS = {
  'Content-Type':      'application/json',
  'X-Dassah-Internal': KEY,
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: INTERNAL_HEADERS,
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[internal] POST ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: INTERNAL_HEADERS })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[internal] GET ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method:  'PUT',
    headers: INTERNAL_HEADERS,
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[internal] PUT ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Typed helpers ─────────────────────────────────────────────────────────────

export interface SearchResult {
  entityType: string
  entityId:   string
  metadata:   unknown
  distance:   number
}

export interface UserAIProfileData {
  id?:           string
  userId?:       string
  measurements?: Record<string, unknown> | null
  preferences?:  Record<string, unknown> | null
  signals?:      Record<string, unknown> | null
  rawContext?:   string | null
}

export const internalClient = {
  // ── Embeddings ──────────────────────────────────────────────────────────────
  async upsertEmbedding(params: {
    entityType:  string
    entityId:    string
    metadata:    Record<string, unknown>
    contentHash: string
    vector:      number[]
  }): Promise<void> {
    await post('/api/ai/embeddings/upsert', params)
  },

  async searchEmbeddings(params: {
    vector:      number[]
    entityType?: string
    limit?:      number
    threshold?:  number
  }): Promise<SearchResult[]> {
    const res = await post<{ success: boolean; data: SearchResult[] }>(
      '/api/ai/embeddings/search',
      params,
    )
    return res.data
  },

  // ── User AI Profile ─────────────────────────────────────────────────────────
  async getProfile(userId: string): Promise<UserAIProfileData | null> {
    const res = await get<{ success: boolean; data: UserAIProfileData | null }>(
      `/api/ai/profile/${userId}`,
    )
    return res.data
  },

  async upsertProfile(userId: string, data: Partial<UserAIProfileData>): Promise<UserAIProfileData> {
    const res = await put<{ success: boolean; data: UserAIProfileData }>(
      `/api/ai/profile/${userId}`,
      data,
    )
    return res.data
  },

  // ── Batch context (for indexer) ─────────────────────────────────────────────
  async getBatch(params: {
    type:          string
    limit?:        number
    offset?:       number
    updatedSince?: string
  }): Promise<{ items: unknown[]; total: number; hasMore: boolean }> {
    const qs = new URLSearchParams({ type: params.type })
    if (params.limit)        qs.set('limit',        String(params.limit))
    if (params.offset)       qs.set('offset',       String(params.offset))
    if (params.updatedSince) qs.set('updatedSince', params.updatedSince)

    const res = await get<{ success: boolean; data: { items: unknown[]; total: number; hasMore: boolean } }>(
      `/api/ai/context/batch?${qs}`,
    )
    return res.data
  },

  // ── Logging (fire-and-forget) ───────────────────────────────────────────────
  logTurn(params: {
    userId:            string
    sessionId:         string
    channel:           string
    intent?:           string
    userMessage:       string
    assistantResponse: string
    toolsCalled:       string[]
    ragHits?:          number
    tokensPrompt?:     number
    tokensCompletion?: number
    latencyMs?:        number
    modelUsed?:        string
    guardBlocked?:     boolean
  }): void {
    post('/api/ai/logs/turn', params).catch((err) =>
      console.error('[internal] logTurn failed:', err.message),
    )
  },

  logGuardEvent(params: {
    userId:         string
    type:           string
    inputFragment?: string
  }): void {
    post('/api/ai/logs/guard', params).catch((err) =>
      console.error('[internal] logGuardEvent failed:', err.message),
    )
  },
}
