import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { connection } from '../queues';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const MARKETX_API_URL = process.env.MARKETX_API_URL;
const MARKETX_API_KEY = process.env.MARKETX_API_KEY;

type WhatsAppBroadcastResponse = {
  campaignId?: string;
  recipientCount?: number;
};

type InstagramPostResponse = {
  postId?: string;
  reach?: number;
};

export const sellerCampaignWorker = new Worker('seller-campaigns', async (job: Job) => {
  const { sellerId, campaignType, platform, message, targetAudience } = job.data;

  console.log(`[Worker] Processing campaign ${job.id} for seller ${sellerId}`);

  if (!MARKETX_API_URL || !MARKETX_API_KEY) {
    throw new Error('Missing MarketX credentials in worker environment.');
  }

  if (campaignType === 'social_media') {
    if (platform === 'whatsapp') {
      const response = await fetch(`${MARKETX_API_URL}/sellers/${sellerId}/broadcast`, {
        method: 'POST',
        headers: {
          'X-API-Key': MARKETX_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ platform: 'whatsapp', message, audience: targetAudience })
      });

      if (!response.ok) {
        throw new Error(`WhatsApp broadcast failed: ${response.statusText}`);
      }

      const result = await response.json() as WhatsAppBroadcastResponse;

      const pubSubClient = new Redis(redisUrl);
      await pubSubClient.publish(`notify:${sellerId}`, JSON.stringify({
        id: `campaign-${job.id}`,
        role: 'system',
        content: `WhatsApp broadcast sent to ${result.recipientCount || 'your'} customers!`,
        metadata: { type: 'CAMPAIGN_COMPLETE', campaignId: result.campaignId },
        createdAt: new Date().toISOString()
      }));
      pubSubClient.quit();

      return { status: 'success', recipients: result.recipientCount };
    }

    if (platform === 'instagram') {
      const response = await fetch(`${MARKETX_API_URL}/sellers/${sellerId}/posts`, {
        method: 'POST',
        headers: {
          'X-API-Key': MARKETX_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ caption: message, platform: 'instagram' })
      });

      if (!response.ok) {
        throw new Error(`Instagram post failed: ${response.statusText}`);
      }

      const result = await response.json() as InstagramPostResponse;

      const pubSubClient = new Redis(redisUrl);
      await pubSubClient.publish(`notify:${sellerId}`, JSON.stringify({
        id: `campaign-${job.id}`,
        role: 'system',
        content: `Instagram post published! Reach: ${result.reach || 'your followers'}`,
        metadata: { type: 'CAMPAIGN_COMPLETE', postId: result.postId },
        createdAt: new Date().toISOString()
      }));
      pubSubClient.quit();

      return { status: 'success', postId: result.postId };
    }
  }

  throw new Error('Invalid campaign type or platform');
}, { connection });

sellerCampaignWorker.on('completed', (job) => {
  console.log(`[Worker] Campaign job ${job.id} completed successfully.`);
});
sellerCampaignWorker.on('failed', (job, err) => {
  console.error(`[Worker] Campaign job ${job?.id} failed:`, err.message);
});
