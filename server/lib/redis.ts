import redis from 'redis';
import { config } from '../config/index.js';

let redisClient: redis.RedisClientType | null = null;

export async function initRedis() {
  if (!redisClient) {
    redisClient = redis.createClient({
      url: config.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            return new Error('Redis reconnection attempts exhausted');
          }
          return retries * 50;
        },
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis Client Connected');
    });

    await redisClient.connect();
  }

  return redisClient;
}

export function getRedis() {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return redisClient;
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
