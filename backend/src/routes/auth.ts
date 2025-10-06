import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { asyncHandler } from '@/middleware/errorHandler';
import { CustomError } from '@/middleware/errorHandler';
import { GitHubService } from '@/services/githubService';
import { GitLabService } from '@/services/gitlabService';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { logger } from '@/utils/logger';

const router = Router();

// Register a new user
router.post('/register',
  body('email').isEmail().normalizeEmail(),
  body('username').isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_-]+$/),
  body('password').isLength({ min: 8 }),
  body('firstName').optional().isString().trim(),
  body('lastName').optional().isString().trim(),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid registration data', 400);
    }

    const { email, username, password, firstName, lastName } = req.body;

    // TODO: Implement user registration logic
    // This would:
    // 1. Check if email/username already exists
    // 2. Hash the password
    // 3. Create user record in database
    // 4. Send verification email

    const hashedPassword = await bcrypt.hash(password, 12);

    // For now, just return success
    res.status(201).json({
      message: 'User registered successfully. Please check your email for verification.',
    });
  })
);

// Login user
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid login credentials', 400);
    }

    const { email, password } = req.body;

    // TODO: Implement user login logic
    // This would:
    // 1. Find user by email
    // 2. Verify password
    // 3. Check if user is active and verified
    // 4. Generate JWT token

    // Mock user for demonstration
    const mockUser = {
      id: 'user-123',
      email: 'user@example.com',
      username: 'testuser',
      role: 'user',
    };

    const token = jwt.sign(
      {
        userId: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: mockUser.role,
      },
      process.env.JWT_SECRET as jwt.Secret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: mockUser.role,
      },
    });
  })
);

// GitHub OAuth callback
// GitHub OAuth start
router.get('/github/start', asyncHandler(async (req: Request, res: Response) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.GITHUB_REDIRECT_URI || `${process.env.BACKEND_URL}/api/auth/github/callback`;
  const scopes = ['read:user', 'user:email'].join(' ');
  const state = Math.random().toString(36).slice(2);
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId || '');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
}));

// GitHub OAuth callback (GET)
router.get('/github/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    if (!code) {
      throw new CustomError('Missing authorization code', 400);
    }

    try {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: process.env.GITHUB_REDIRECT_URI || `${process.env.BACKEND_URL}/api/auth/github/callback`,
        }),
      });

      const tokenData = await tokenResponse.json();
      if (tokenData.error) {
        throw new CustomError('GitHub OAuth error: ' + tokenData.error_description, 400);
      }

      // Placeholder: exchange token for user info, then issue JWT
      const jwtToken = jwt.sign(
        {
          userId: 'github-user-123',
          email: 'github@example.com',
          username: 'githubuser',
          role: 'user',
        },
        process.env.JWT_SECRET as jwt.Secret,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/?token=${encodeURIComponent(jwtToken)}`);
    } catch (error) {
      logger.error('GitHub OAuth error:', error);
      throw new CustomError('GitHub authentication failed', 400);
    }
  })
);

// GitLab OAuth callback
router.post('/gitlab/callback',
  body('code').isString(),
  body('state').optional().isString(),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid OAuth callback data', 400);
    }

    const { code, state } = req.body;

    try {
      // Exchange code for access token
      const tokenResponse = await fetch(`${process.env.GITLAB_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: process.env.GITLAB_CLIENT_ID,
          client_secret: process.env.GITLAB_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: process.env.GITLAB_REDIRECT_URI,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        throw new CustomError('GitLab OAuth error: ' + tokenData.error_description, 400);
      }

      // Get user info from GitLab
      const gitlabService = new GitLabService(tokenData.access_token, process.env.GITLAB_URL);
      const gitlabUser = await gitlabService.getRepositories(); // This would be getUser() in a real implementation

      // TODO: Implement user creation/login logic
      const jwtToken = jwt.sign(
        {
          userId: 'gitlab-user-123',
          email: 'gitlab@example.com',
          username: 'gitlabuser',
          role: 'user',
        },
        process.env.JWT_SECRET as jwt.Secret,
        { expiresIn: (process.env.JWT_EXPIRES_IN as string) || '7d' }
      );

      res.json({
        message: 'GitLab authentication successful',
        token: jwtToken,
        user: {
          id: 'gitlab-user-123',
          email: 'gitlab@example.com',
          username: 'gitlabuser',
          role: 'user',
        },
      });
    } catch (error) {
      logger.error('GitLab OAuth error:', error);
      throw new CustomError('GitLab authentication failed', 400);
    }
  })
);

// Refresh token
router.post('/refresh',
  body('token').isString(),
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError('Invalid token', 400);
    }

    const { token } = req.body;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      // TODO: Verify user still exists and is active
      
      const newToken = jwt.sign(
        {
          userId: decoded.userId,
          email: decoded.email,
          username: decoded.username,
          role: decoded.role,
        },
        process.env.JWT_SECRET as jwt.Secret,
        { expiresIn: process.env.JWT_EXPIRES_IN ? String(process.env.JWT_EXPIRES_IN) : '7d' }
      );

      res.json({
        message: 'Token refreshed successfully',
        token: newToken,
      });
    } catch (error) {
      throw new CustomError('Invalid or expired token', 401);
    }
  })
);

// Logout (client-side token removal)
router.post('/logout',
  asyncHandler(async (req: Request, res: Response) => {
    // In a stateless JWT system, logout is typically handled client-side
    // by removing the token. For enhanced security, you could implement
    // a token blacklist or use refresh tokens.
    
    res.json({ message: 'Logged out successfully' });
  })
);

// Get current user profile
router.get('/me',
  asyncHandler(async (req: Request, res: Response) => {
    // This would typically use authentication middleware
    // For now, return mock data
    res.json({
      user: {
        id: 'user-123',
        email: 'user@example.com',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        createdAt: new Date().toISOString(),
      },
    });
  })
);

export default router;
