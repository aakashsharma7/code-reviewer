import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  clone_url: string;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  created_at: string;
  updated_at: string;
  merged_at?: string;
}

export interface GitHubWebhookPayload {
  action: string;
  pull_request?: GitHubPullRequest;
  repository?: GitHubRepository;
  sender?: {
    login: string;
    avatar_url: string;
  };
}

export class GitHubService {
  private api: AxiosInstance;
  private token: string;

  constructor(token: string) {
    this.token = token;
    this.api = axios.create({
      baseURL: 'https://api.github.com',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Code-Reviewer-Platform/1.0',
      },
    });
  }

  async getRepositories(): Promise<GitHubRepository[]> {
    try {
      const response = await this.api.get('/user/repos', {
        params: {
          per_page: 100,
          sort: 'updated',
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch GitHub repositories:', error);
      throw error;
    }
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch GitHub repository ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubPullRequest[]> {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/pulls`, {
        params: {
          state,
          per_page: 100,
          sort: 'updated',
        },
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch pull requests for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequest> {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/pulls/${number}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch pull request ${owner}/${repo}#${number}:`, error);
      throw error;
    }
  }

  async createPullRequestComment(owner: string, repo: string, number: number, body: string): Promise<void> {
    try {
      await this.api.post(`/repos/${owner}/${repo}/issues/${number}/comments`, {
        body,
      });
      logger.info(`Created comment on PR ${owner}/${repo}#${number}`);
    } catch (error) {
      logger.error(`Failed to create comment on PR ${owner}/${repo}#${number}:`, error);
      throw error;
    }
  }

  async createPullRequestReview(owner: string, repo: string, number: number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string): Promise<void> {
    try {
      await this.api.post(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
        event,
        body,
      });
      logger.info(`Created review on PR ${owner}/${repo}#${number}`);
    } catch (error) {
      logger.error(`Failed to create review on PR ${owner}/${repo}#${number}:`, error);
      throw error;
    }
  }

  async getRepositoryContents(owner: string, repo: string, path: string, ref?: string): Promise<any> {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/contents/${path}`, {
        params: {
          ref: ref || 'main',
        },
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch contents for ${owner}/${repo}/${path}:`, error);
      throw error;
    }
  }

  async createWebhook(owner: string, repo: string, webhookUrl: string, secret: string): Promise<void> {
    try {
      await this.api.post(`/repos/${owner}/${repo}/hooks`, {
        name: 'web',
        active: true,
        events: ['pull_request', 'push'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret,
        },
      });
      logger.info(`Created webhook for ${owner}/${repo}`);
    } catch (error) {
      logger.error(`Failed to create webhook for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async deleteWebhook(owner: string, repo: string, hookId: number): Promise<void> {
    try {
      await this.api.delete(`/repos/${owner}/${repo}/hooks/${hookId}`);
      logger.info(`Deleted webhook ${hookId} for ${owner}/${repo}`);
    } catch (error) {
      logger.error(`Failed to delete webhook ${hookId} for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  async getWebhooks(owner: string, repo: string): Promise<any[]> {
    try {
      const response = await this.api.get(`/repos/${owner}/${repo}/hooks`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch webhooks for ${owner}/${repo}:`, error);
      throw error;
    }
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
