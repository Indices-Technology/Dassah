import { Queue } from 'bullmq';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
connection.on('error', (err) => console.error('[Queue/Redis] connection error:', err.message));

// Cast needed: BullMQ bundles its own ioredis copy, causing TS2322 on the shared instance.
const conn = connection as any;
export const orderQueue = new Queue('order-processing', { connection: conn });
export const notifierQueue = new Queue('notifications', { connection: conn });

export interface OrderJobData {
  userId: string;
  productId: string;
  approvalToken: string;
  reference: string;
}

/**
 * Enqueues an order for processing after explicit user approval (ADR-006)
 * This keeps the chat UI instantly responsive while external APIs do the heavy lifting.
 */
export const enqueueOrderProcessing = async (orderData: OrderJobData) => {
  console.log(`[Queue] Enqueuing order for approval token: ${orderData.approvalToken}`);
  
  return await orderQueue.add('process-order', orderData, {
    attempts: 3, // Retry on network failure
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false // Keep failed jobs for manual inspection
  });
};