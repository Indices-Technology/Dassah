// Background indexer — keeps MarketX entity embeddings up to date.
//
// Startup:  full reindex of all PRODUCT / SELLER / SQUARE entities
//           (skipped if embeddings already exist — uses contentHash to diff)
// Ongoing:  incremental poll every POLL_INTERVAL_MS, fetching only entities
//           updated since the last successful run.

import { embedEntity }    from '../services/embedding.service'
import { internalClient } from '../lib/internal'

const POLL_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes
const BATCH_SIZE       = 50
const CONCURRENCY      = 5              // parallel embed calls per batch

const ENTITY_TYPES = ['PRODUCT', 'SELLER', 'SQUARE'] as const
type EntityType = (typeof ENTITY_TYPES)[number]

// Cursor per entity type — ISO timestamp of last successful index run
const cursors: Record<EntityType, string | undefined> = {
  PRODUCT: undefined,
  SELLER:  undefined,
  SQUARE:  undefined,
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function withConcurrency<T>(
  items:       T[],
  concurrency: number,
  fn:          (item: T) => Promise<void>,
): Promise<void> {
  let i = 0
  async function worker() {
    while (i < items.length) {
      const item = items[i++]
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
}

// ── Index a single entity ─────────────────────────────────────────────────────

async function indexEntity(type: EntityType, entity: Record<string, any>): Promise<void> {
  try {
    const entityId = String(entity.id ?? entity.entityId)
    const { vector, contentHash, text: _text } = await embedEntity(type, entity)

    // Build the metadata snapshot stored alongside the vector
    const metadata: Record<string, unknown> = { entityType: type, entityId }

    if (type === 'PRODUCT') {
      metadata.title     = entity.title
      metadata.price     = entity.price
      metadata.discount  = entity.discount ?? null
      metadata.slug      = entity.slug
      metadata.imageUrl  = entity.media?.[0]?.url ?? null
      metadata.inStock   = entity.variants?.some((v: any) => v.stock > 0) ?? true
      metadata.sellerId  = entity.seller?.id
      metadata.sellerName = entity.seller?.storeName
    } else if (type === 'SELLER') {
      metadata.storeName     = entity.storeName
      metadata.storeSlug     = entity.storeSlug
      metadata.locationLabel = entity.locationLabel
      metadata.city          = entity.city
      metadata.state         = entity.state
      metadata.isVerified    = entity.isVerified
    } else {
      metadata.name  = entity.name
      metadata.slug  = entity.slug
      metadata.type  = entity.type
      metadata.city  = entity.city
      metadata.state = entity.state
    }

    await internalClient.upsertEmbedding({ entityType: type, entityId, metadata, contentHash, vector })
  } catch (err) {
    console.error(`[indexer] failed to index ${type} ${entity.id}:`, (err as Error).message)
  }
}

// ── Batch indexing pass ───────────────────────────────────────────────────────

async function indexBatch(type: EntityType, updatedSince?: string): Promise<void> {
  let offset   = 0
  let hasMore  = true
  let indexed  = 0

  while (hasMore) {
    const batch = await internalClient.getBatch({
      type,
      limit:  BATCH_SIZE,
      offset,
      updatedSince,
    })

    if (!batch.items.length) break

    await withConcurrency(
      batch.items as Record<string, any>[],
      CONCURRENCY,
      (entity) => indexEntity(type, entity),
    )

    indexed  += batch.items.length
    hasMore   = batch.hasMore
    offset   += BATCH_SIZE
  }

  if (indexed > 0) {
    console.log(`[indexer] ${type}: indexed ${indexed} entities${updatedSince ? ' (incremental)' : ' (full)'}`)
  }
}

// ── Incremental poll ──────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  const now = new Date().toISOString()

  for (const type of ENTITY_TYPES) {
    try {
      await indexBatch(type, cursors[type])
      cursors[type] = now
    } catch (err) {
      console.error(`[indexer] poll failed for ${type}:`, (err as Error).message)
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

export function startIndexer(): void {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[indexer] OPENAI_API_KEY not set — indexer disabled')
    return
  }
  if (!process.env.MARKETX_API_URL) {
    console.warn('[indexer] MARKETX_API_URL not set — indexer disabled')
    return
  }

  console.log('[indexer] starting — full reindex on boot, then polling every 5 min')

  // Full reindex on startup (cursors undefined → no updatedSince filter)
  poll().catch((err) => console.error('[indexer] initial run failed:', err))

  // Incremental polling
  setInterval(() => {
    poll().catch((err) => console.error('[indexer] poll error:', err))
  }, POLL_INTERVAL_MS)
}
