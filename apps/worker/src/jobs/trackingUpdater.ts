import { Worker, Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { connection } from '../queues';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const trackingQueue = new Queue('tracking-updates', { connection });

// Run every 2 hours (cron syntax)
trackingQueue.add('poll-tracking', {}, {
  repeat: { pattern: '0 */2 * * *' }
});

/**
 * Tracking Updater Worker (ADR-004)
 * 
 * Periodically polls external APIs for tracking updates on active orders.
 * Pushes notifications to the user via WebSocket (Redis pub/sub) if the status changes.
 */
export const trackingUpdaterWorker = new Worker('tracking-updates', async (job: Job) => {
  console.log(`[Worker] Running scheduled tracking updates (Job ${job.id})...`);

  /* 
   * TODO: Full implementation would look like this:
   * 1. Query DB for active orders: `prisma.order.findMany({ where: { status: { in: ['SHIPPED', 'IN_TRANSIT'] } } })`
   * 2. Loop through orders, ping GIG/DHL APIs for current status.
   * 3. If `newStatus !== currentStatus`, update DB and notify user:
   */
  
  // MOCK IMPLEMENTATION (To be replaced with actual DB/API logic):
  const mockUserId = 'sample-user-id';
  const hasUpdate = false; // Simulate checking updates

  if (hasUpdate) {
    const pubSubClient = new Redis(redisUrl);
    await pubSubClient.publish(`notify:${mockUserId}`, JSON.stringify({
      id: `tracking-update-${Date.now()}`,
      role: 'bot',
      content: `Great news! Your order #12345 is now OUT FOR DELIVERY.`,
      metadata: { orderId: '12345', status: 'OUT_FOR_DELIVERY' },
      createdAt: new Date().toISOString()
    }));
    pubSubClient.quit();
  }
 
  return { status: 'success', timestamp: new Date().toISOString() };
}, { connection });

trackingUpdaterWorker.on('failed', (job, err) => {
  console.error(`[Worker] Tracking updater failed:`, err.message);
});