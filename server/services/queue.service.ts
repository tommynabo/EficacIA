import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { getRedis } from '../lib/redis.js';
import { config } from '../config/index.js';

interface ScrapingJobData {
  campaignId: string;
  userId: string;
  searchUrl: string;
  linkedInAccountId: string;
  sessionCookie: string;
  maxLeads: number;
}

interface SendMessageJobData {
  leadId: string;
  profileUrl: string;
  message: string;
  linkedInAccountId: string;
  sessionCookie: string;
}

interface AnalyzeProfileJobData {
  leadId: string;
  name: string;
  title?: string;
  company?: string;
  bio?: string;
  recentPost?: string;
}

let scrapingQueue: Queue;
let sendMessageQueue: Queue;
let analyzeQueue: Queue;

export async function initQueues() {
  const redisUrl = config.REDIS_URL;

  scrapingQueue = new Queue('scraping', {
    connection: { url: redisUrl } as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
    },
  });

  sendMessageQueue = new Queue('send-message', {
    connection: { url: redisUrl } as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
    },
  });

  analyzeQueue = new Queue('analyze-profile', {
    connection: { url: redisUrl } as any,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: true,
    },
  });

  // Set queue event listeners
  setupQueueListeners(scrapingQueue, 'scraping', redisUrl);
  setupQueueListeners(sendMessageQueue, 'send-message', redisUrl);
  setupQueueListeners(analyzeQueue, 'analyze-profile', redisUrl);

  console.log('Queues initialized');

  return { scrapingQueue, sendMessageQueue, analyzeQueue };
}

function setupQueueListeners(queue: Queue, queueName: string, redisUrl: string) {
  const queueEvents = new QueueEvents(queue.name, {
    connection: { url: redisUrl } as any,
  });

  queueEvents.on('completed', ({ jobId, returnvalue }) => {
    console.log(`✓ ${queueName} job ${jobId} completed:`, returnvalue);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`✗ ${queueName} job ${jobId} failed:`, failedReason);
  });

  queueEvents.on('error', (error) => {
    console.error(`${queueName} queue error:`, error);
  });
}

export function getScrapingQueue(): Queue {
  if (!scrapingQueue) throw new Error('Queues not initialized');
  return scrapingQueue;
}

export function getSendMessageQueue(): Queue {
  if (!sendMessageQueue) throw new Error('Queues not initialized');
  return sendMessageQueue;
}

export function getAnalyzeQueue(): Queue {
  if (!analyzeQueue) throw new Error('Queues not initialized');
  return analyzeQueue;
}

// Job scheduling
export async function addScrapingJob(data: ScrapingJobData): Promise<Job> {
  const queue = getScrapingQueue();
  return queue.add('scrape', data, {
    priority: 10,
  });
}

export async function addSendMessageJob(
  data: SendMessageJobData,
  delayMs?: number
): Promise<Job> {
  const queue = getSendMessageQueue();
  
  // Calculate random delay between min and max to appear human-like
  const randomDelay = Math.random() * (config.MAX_DELAY_BETWEEN_ACTIONS_MS - config.MIN_DELAY_BETWEEN_ACTIONS_MS) + config.MIN_DELAY_BETWEEN_ACTIONS_MS;
  const totalDelay = delayMs ? delayMs + randomDelay : randomDelay;

  return queue.add('send', data, {
    delay: Math.floor(totalDelay),
    priority: 5,
  });
}

export async function addAnalyzeProfileJob(data: AnalyzeProfileJobData): Promise<Job> {
  const queue = getAnalyzeQueue();
  return queue.add('analyze', data, {
    priority: 1,
  });
}

// Batch operations
export async function scheduleCampaignLeads(
  campaignId: string,
  leadIds: string[],
  dailyLimit: number = 25
): Promise<void> {
  const queue = getSendMessageQueue();
  
  // Distribute leads across the day
  const delayBetweenLeads = (24 * 60 * 60 * 1000) / dailyLimit; // Spread across 24 hours

  for (let i = 0; i < leadIds.length; i++) {
    const delayMs = i * delayBetweenLeads;
    
    // Job will be added to queue with proper delay
    // The actual lead data will be fetched during job processing
    await queue.add(
      'schedule',
      { leadId: leadIds[i], campaignId },
      { delay: Math.floor(delayMs) }
    );
  }
}

// Queue status
export async function getQueueStats() {
  return {
    scraping: {
      active: await getScrapingQueue().getActiveCount(),
      waiting: await getScrapingQueue().getWaitingCount(),
      failed: await getScrapingQueue().getFailedCount(),
      completed: await getScrapingQueue().getCompletedCount(),
    },
    sendMessage: {
      active: await getSendMessageQueue().getActiveCount(),
      waiting: await getSendMessageQueue().getWaitingCount(),
      failed: await getSendMessageQueue().getFailedCount(),
      completed: await getSendMessageQueue().getCompletedCount(),
    },
    analyze: {
      active: await getAnalyzeQueue().getActiveCount(),
      waiting: await getAnalyzeQueue().getWaitingCount(),
      failed: await getAnalyzeQueue().getFailedCount(),
      completed: await getAnalyzeQueue().getCompletedCount(),
    },
  };
}
