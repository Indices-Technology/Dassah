import Redis from 'ioredis'
import { Queue } from 'bullmq'

// Queue names — must be identical to the names used in apps/api/src/services/queue.ts.
// The API enqueues; the worker dequeues. A name mismatch means jobs are never processed.

export const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})
connection.on('error', (err) => console.error('[Worker/Redis] connection error:', err.message))

export const QUEUES = {
  ORDERS: 'order-processing',
  TRACKING: 'tracking-updates',
  NOTIFICATIONS: 'notifications',
  CAMPAIGNS: 'seller-campaigns',
} as const
