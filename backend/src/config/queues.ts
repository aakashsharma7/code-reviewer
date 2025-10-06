import Queue from 'bull';
import { logger } from '@/utils/logger';

export let analysisQueue: Queue.Queue;
export let webhookQueue: Queue.Queue;
export let reportQueue: Queue.Queue;

export async function setupQueues(): Promise<void> {
  try {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    // Analysis queue for code analysis tasks
    analysisQueue = new Queue('code analysis', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    // Webhook queue for processing webhook events
    webhookQueue = new Queue('webhook processing', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 100,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });

    // Report queue for generating reports
    reportQueue = new Queue('report generation', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 5000,
        },
      },
    });

    // Queue event handlers
    analysisQueue.on('completed', (job) => {
      logger.info(`Analysis job ${job.id} completed`);
    });

    analysisQueue.on('failed', (job, err) => {
      logger.error(`Analysis job ${job.id} failed:`, err);
    });

    webhookQueue.on('completed', (job) => {
      logger.info(`Webhook job ${job.id} completed`);
    });

    webhookQueue.on('failed', (job, err) => {
      logger.error(`Webhook job ${job.id} failed:`, err);
    });

    reportQueue.on('completed', (job) => {
      logger.info(`Report job ${job.id} completed`);
    });

    reportQueue.on('failed', (job, err) => {
      logger.error(`Report job ${job.id} failed:`, err);
    });

    logger.info('Queues initialized successfully');
  } catch (error) {
    logger.error('Failed to setup queues:', error);
    throw error;
  }
}

export async function closeQueues(): Promise<void> {
  try {
    await Promise.all([
      analysisQueue?.close(),
      webhookQueue?.close(),
      reportQueue?.close(),
    ]);
    logger.info('All queues closed');
  } catch (error) {
    logger.error('Error closing queues:', error);
  }
}
