import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { CustomError } from '@/middleware/errorHandler';
import { reportQueue } from '@/config/queues';
import { logger } from '@/utils/logger';

const router = Router();

// Generate PDF report for a review
router.post('/review/:reviewId/pdf',
  authenticateToken,
  param('reviewId').isUUID(),
  body('includeIssues').optional().isBoolean(),
  body('includeCharts').optional().isBoolean(),
  body('includeRecommendations').optional().isBoolean(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid request data', 400);
    }

    const { reviewId } = req.params;
    const { 
      includeIssues = true, 
      includeCharts = true, 
      includeRecommendations = true 
    } = req.body;

    // Add to report generation queue
    const job = await reportQueue.add('generate-pdf-report', {
      reviewId,
      type: 'review',
      format: 'pdf',
      options: {
        includeIssues,
        includeCharts,
        includeRecommendations,
      },
      userId: req.user!.id,
    }, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000,
      },
    });

    logger.info(`Created PDF report job ${job.id} for review ${reviewId}`);

    res.status(202).json({
      message: 'Report generation started',
      jobId: job.id,
      statusUrl: `/api/reports/jobs/${job.id}`,
    });
  })
);

// Generate PDF report for a repository
router.post('/repository/:repositoryId/pdf',
  authenticateToken,
  param('repositoryId').isUUID(),
  body('timeRange').optional().isIn(['24h', '7d', '30d', '90d']),
  body('includeReviews').optional().isBoolean(),
  body('includeIssues').optional().isBoolean(),
  body('includeTrends').optional().isBoolean(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid request data', 400);
    }

    const { repositoryId } = req.params;
    const { 
      timeRange = '30d',
      includeReviews = true,
      includeIssues = true,
      includeTrends = true,
    } = req.body;

    // Add to report generation queue
    const job = await reportQueue.add('generate-pdf-report', {
      repositoryId,
      type: 'repository',
      format: 'pdf',
      timeRange,
      options: {
        includeReviews,
        includeIssues,
        includeTrends,
      },
      userId: req.user!.id,
    }, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000,
      },
    });

    logger.info(`Created PDF report job ${job.id} for repository ${repositoryId}`);

    res.status(202).json({
      message: 'Report generation started',
      jobId: job.id,
      statusUrl: `/api/reports/jobs/${job.id}`,
    });
  })
);

// Generate CSV report for issues
router.post('/issues/csv',
  authenticateToken,
  body('repositoryIds').optional().isArray(),
  body('timeRange').optional().isIn(['24h', '7d', '30d', '90d']),
  body('severity').optional().isIn(['info', 'minor', 'major', 'critical', 'blocker']),
  body('type').optional().isIn(['bug', 'vulnerability', 'code_smell', 'security_hotspot', 'style']),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid request data', 400);
    }

    const { 
      repositoryIds = [],
      timeRange = '30d',
      severity,
      type,
    } = req.body;

    // Add to report generation queue
    const job = await reportQueue.add('generate-csv-report', {
      type: 'issues',
      format: 'csv',
      filters: {
        repositoryIds,
        timeRange,
        severity,
        type,
      },
      userId: req.user!.id,
    }, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 5000,
      },
    });

    logger.info(`Created CSV report job ${job.id} for issues`);

    res.status(202).json({
      message: 'Report generation started',
      jobId: job.id,
      statusUrl: `/api/reports/jobs/${job.id}`,
    });
  })
);

// Get report generation job status
router.get('/jobs/:jobId',
  authenticateToken,
  param('jobId').isString(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid job ID', 400);
    }

    const { jobId } = req.params;

    // Get job status from queue
    const job = await reportQueue.getJob(jobId);
    
    if (!job) {
      throw new CustomError('Job not found', 404);
    }

    const state = await job.getState();
    const progress = job.progress();

    res.json({
      jobId,
      status: state,
      progress,
      data: job.data,
      result: job.returnvalue,
      error: job.failedReason,
    });
  })
);

// Download generated report
router.get('/download/:jobId',
  authenticateToken,
  param('jobId').isString(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid job ID', 400);
    }

    const { jobId } = req.params;

    // Get job and check if it's completed
    const job = await reportQueue.getJob(jobId);
    
    if (!job) {
      throw new CustomError('Job not found', 404);
    }

    const state = await job.getState();
    
    if (state !== 'completed') {
      throw new CustomError('Report not ready yet', 202);
    }

    const result = job.returnvalue;
    
    if (!result || !result.filePath) {
      throw new CustomError('Report file not found', 404);
    }

    // Set appropriate headers for file download
    res.setHeader('Content-Type', result.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    
    // Stream the file
    const fs = require('fs');
    const fileStream = fs.createReadStream(result.filePath);
    
    fileStream.pipe(res);
    
    // Clean up file after download
    fileStream.on('end', () => {
      fs.unlink(result.filePath, (err: any) => {
        if (err) {
          logger.error('Failed to delete report file:', err);
        }
      });
    });
  })
);

// Get available report templates
router.get('/templates',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // TODO: Implement template listing
    // This would return available report templates from the database or filesystem

    const mockTemplates = [
      {
        id: 'review-summary',
        name: 'Review Summary',
        description: 'Basic review summary with key metrics',
        type: 'review',
        format: 'pdf',
      },
      {
        id: 'detailed-analysis',
        name: 'Detailed Analysis',
        description: 'Comprehensive analysis with all issues and recommendations',
        type: 'review',
        format: 'pdf',
      },
      {
        id: 'repository-health',
        name: 'Repository Health',
        description: 'Repository health overview with trends',
        type: 'repository',
        format: 'pdf',
      },
      {
        id: 'issues-export',
        name: 'Issues Export',
        description: 'Export all issues in CSV format',
        type: 'issues',
        format: 'csv',
      },
    ];

    res.json({
      templates: mockTemplates,
    });
  })
);

// Get report history for user
router.get('/history',
  authenticateToken,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('type').optional().isIn(['review', 'repository', 'issues']),
  query('format').optional().isIn(['pdf', 'csv']),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid query parameters', 400);
    }

    const { page = 1, limit = 20, type, format } = req.query;

    // TODO: Implement database query to get user's report history
    // This would query a reports table with user filtering

    const mockHistory = [
      {
        id: 'report-1',
        type: 'review',
        format: 'pdf',
        status: 'completed',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        filename: 'review-123-summary.pdf',
        size: 1024000,
      },
      {
        id: 'report-2',
        type: 'repository',
        format: 'pdf',
        status: 'completed',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
        filename: 'repository-health-report.pdf',
        size: 2048000,
      },
    ];

    res.json({
      reports: mockHistory,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: mockHistory.length,
        pages: 1,
      },
    });
  })
);

export default router;
