import { Worker } from 'bullmq';
import { connection, QUEUES } from '../queues';
import { Emitter } from '@socket.io/redis-emitter';
import Redis from 'ioredis';

const redisClient = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
const io = new Emitter(redisClient);

// Sends real-time notifications to users via their active WebSocket session.
// Uses Socket.IO server-side emit targeting a specific socket ID.
//
// Job data:
//   socketId  — the user's active Socket.IO connection ID
//   event     — the event name to emit (e.g. 'order:update', 'chat:message')
//   payload   — the event payload

export const notifierWorker = new Worker(
  QUEUES.NOTIFICATIONS,
  async (job) => {
    const { socketId, event, payload } = job.data as {
      socketId: string;
      event: string;
      payload: unknown;
    };

    console.log(`[Notifier] Emitting '${event}' to socket ${socketId}`);
    
    // Use Redis Emitter to push the event through the Socket.IO Redis adapter
    // The main API server will receive this and push it down the WebSocket connection.
    io.to(socketId).emit(event, payload);
  },
  { connection },
);
