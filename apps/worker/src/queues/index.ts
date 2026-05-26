import Redis from 'ioredis'
import { Queue } from 'bullmq'

// Queue names — must be identical to the names used in apps/api/src/services/queue.ts.
// The API enqueues; the worker dequeues. A name mismatch means jobs are never processed.

// Cast needed: BullMQ bundles its own ioredis copy, causing TS2322 on the shared instance.
const _connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
_connection.on('error', (err) => console.error('[Worker/Redis] connection error:', err.message))
export const connection = _connection as any

export const QUEUES = {
  ORDERS: 'order-processing',
  TRACKING: 'tracking-updates',
  NOTIFICATIONS: 'notifications',
  CAMPAIGNS: 'seller-campaigns',
} as const
