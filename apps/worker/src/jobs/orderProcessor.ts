import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { connection } from '../queues';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const MARKETX_API_URL = process.env.MARKETX_API_URL;
const MARKETX_API_KEY = process.env.MARKETX_API_KEY;

type MarketXOrderResponse = {
  id: string;
  total: number;
  status: string;
  sellerId?: string;
  paymentUrl?: string;
};

type MarketXPaymentResponse = {
  authorizationUrl: string;
};

/**
 * Order Processor Worker
 *
 * Processes purchases asynchronously:
 * 1. Calls POST /commerce/orders to create order on MarketX
 * 2. Calls POST /commerce/payments/initialize for payment
 * 3. Publishes success to Redis for real-time notifications
 */
export const orderProcessorWorker = new Worker('order-processing', async (job: Job) => {
  const { userId, items, paymentMethod, token, sellerId } = job.data;

  console.log(`[Worker] Processing order ${job.id} for user ${userId}`);

  if (!MARKETX_API_URL || !MARKETX_API_KEY) {
    throw new Error('Missing MarketX credentials in worker environment.');
  }

  const headers = {
    'X-API-Key': MARKETX_API_KEY,
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // 1. Create order on MarketX
  const orderRes = await fetch(`${MARKETX_API_URL}/commerce/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ items, paymentMethod }),
  });

  if (!orderRes.ok) {
    throw new Error(`MarketX order creation failed: ${orderRes.statusText}`);
  }

  const orderData = await orderRes.json() as MarketXOrderResponse;

  // 2. Initialize payment if needed
  if (paymentMethod === 'paystack') {
    const paymentRes = await fetch(`${MARKETX_API_URL}/commerce/payments/initialize`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId: orderData.id, amount: orderData.total }),
    });

    if (!paymentRes.ok) {
      throw new Error(`MarketX payment initialization failed: ${paymentRes.statusText}`);
    }

    const paymentData = await paymentRes.json() as MarketXPaymentResponse;
    orderData.paymentUrl = paymentData.authorizationUrl;
  }

  // 3. Notify buyer
  const pubSubClient = new Redis(redisUrl);
  await pubSubClient.publish(`notify:${userId}`, JSON.stringify({
    id: `order-success-${orderData.id}`,
    role: 'system',
    content: `Order placed successfully! Order ID: ${orderData.id}`,
    metadata: { orderId: orderData.id, status: orderData.status },
    createdAt: new Date().toISOString()
  }));

  // 4. Notify seller of new order
  if (orderData.sellerId) {
    await pubSubClient.publish(`notify:${orderData.sellerId}`, JSON.stringify({
      id: `seller-alert-${orderData.id}`,
      role: 'system',
      content: `New order received! Order ID: ${orderData.id}`,
      metadata: { type: 'NEW_ORDER', orderId: orderData.id },
      createdAt: new Date().toISOString()
    }));
  }

  pubSubClient.quit();

  return { status: 'success', orderId: orderData.id, paymentUrl: orderData.paymentUrl };
}, { connection });

orderProcessorWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully.`);
});
orderProcessorWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});
