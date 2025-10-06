import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticateToken } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { CustomError } from '@/middleware/errorHandler';
import { webhookQueue } from '@/config/queues';
import { GitHubService } from '@/services/githubService';
import { GitLabService } from '@/services/gitlabService';
import { logger } from '@/utils/logger';

const router = Router();

// GitHub webhook handler
router.post('/github/:repositoryId', 
  param('repositoryId').isUUID(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid repository ID', 400);
    }

    const { repositoryId } = req.params;
    const signature = req.headers['x-hub-signature-256'] as string;
    const event = req.headers['x-github-event'] as string;
    const payload = req.body;

    logger.info(`Received GitHub webhook: ${event} for repository ${repositoryId}`);

    // Verify webhook signature
    const githubService = new GitHubService(''); // Token not needed for signature verification
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    
    if (webhookSecret && !githubService.verifyWebhookSignature(JSON.stringify(payload), signature, webhookSecret)) {
      throw new CustomError('Invalid webhook signature', 401);
    }

    // Add to webhook processing queue
    await webhookQueue.add('process-github-webhook', {
      repositoryId,
      event,
      payload,
      provider: 'github',
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    res.status(200).json({ message: 'Webhook received and queued for processing' });
  })
);

// GitLab webhook handler
router.post('/gitlab/:repositoryId',
  param('repositoryId').isUUID(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid repository ID', 400);
    }

    const { repositoryId } = req.params;
    const signature = req.headers['x-gitlab-token'] as string;
    const event = req.headers['x-gitlab-event'] as string;
    const payload = req.body;

    logger.info(`Received GitLab webhook: ${event} for repository ${repositoryId}`);

    // Verify webhook signature
    const gitlabService = new GitLabService(''); // Token not needed for signature verification
    const webhookSecret = process.env.GITLAB_WEBHOOK_SECRET;
    
    if (webhookSecret && !gitlabService.verifyWebhookSignature(JSON.stringify(payload), signature, webhookSecret)) {
      throw new CustomError('Invalid webhook signature', 401);
    }

    // Add to webhook processing queue
    await webhookQueue.add('process-gitlab-webhook', {
      repositoryId,
      event,
      payload,
      provider: 'gitlab',
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    res.status(200).json({ message: 'Webhook received and queued for processing' });
  })
);

// Get webhook events for a repository
router.get('/events/:repositoryId',
  authenticateToken,
  param('repositoryId').isUUID(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid repository ID', 400);
    }

    const { repositoryId } = req.params;
    const { page = 1, limit = 20, status } = req.query;

    // TODO: Implement database query to get webhook events
    // This would query the webhook_events table with pagination and filtering

    res.json({
      events: [],
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: 0,
        pages: 0,
      },
    });
  })
);

// Retry failed webhook event
router.post('/events/:eventId/retry',
  authenticateToken,
  param('eventId').isUUID(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid event ID', 400);
    }

    const { eventId } = req.params;

    // TODO: Implement retry logic
    // This would fetch the webhook event from database and re-queue it

    res.json({ message: 'Webhook event queued for retry' });
  })
);

// Test webhook endpoint
router.post('/test/:repositoryId',
  authenticateToken,
  param('repositoryId').isUUID(),
  body('provider').isIn(['github', 'gitlab']),
  body('eventType').notEmpty(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid request data', 400);
    }

    const { repositoryId } = req.params;
    const { provider, eventType } = req.body;

    // Create a test webhook event
    const testPayload = {
      action: 'test',
      repository: { id: repositoryId },
      sender: { login: 'test-user' },
    };

    await webhookQueue.add(`test-${provider}-webhook`, {
      repositoryId,
      event: eventType,
      payload: testPayload,
      provider,
      isTest: true,
    });

    res.json({ message: 'Test webhook event created' });
  })
);

export default router;
