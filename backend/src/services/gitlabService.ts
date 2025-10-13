import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';

export interface GitLabRepository {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string;
  visibility: 'private' | 'internal' | 'public';
  http_url_to_repo: string;
  default_branch: string;
  owner?: {
    username: string;
    avatar_url: string;
  };
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: 'opened' | 'closed' | 'merged';
  author: {
    username: string;
    avatar_url: string;
  };
  source_branch: string;
  target_branch: string;
  created_at: string;
  updated_at: string;
  merged_at?: string;
}

export interface GitLabWebhookPayload {
  object_kind: string;
  event_type: string;
  user: {
    username: string;
    avatar_url: string;
  };
  project: GitLabRepository;
  object_attributes?: GitLabMergeRequest;
}

export class GitLabService {
  private api: AxiosInstance;
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl: string = 'https://gitlab.com') {
    this.token = token;
    this.baseUrl = baseUrl;
    this.api = axios.create({
      baseURL: `${baseUrl}/api/v4`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Code-Reviewer-Platform/1.0',
      },
    });
  }

  async getRepositories(): Promise<GitLabRepository[]> {
    try {
      const response = await this.api.get('/projects', {
        params: {
          membership: true,
          per_page: 100,
          order_by: 'last_activity_at',
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch GitLab repositories:', error);
      throw error;
    }
  }

  async getRepository(projectId: number): Promise<GitLabRepository> {
    try {
      const response = await this.api.get(`/projects/${projectId}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch GitLab repository ${projectId}:`, error);
      throw error;
    }
  }

  async getMergeRequests(projectId: number, state: 'opened' | 'closed' | 'merged' | 'all' = 'opened'): Promise<GitLabMergeRequest[]> {
    try {
      const response = await this.api.get(`/projects/${projectId}/merge_requests`, {
        params: {
          state,
          per_page: 100,
          order_by: 'updated_at',
        },
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch merge requests for project ${projectId}:`, error);
      throw error;
    }
  }

  async getMergeRequest(projectId: number, mergeRequestIid: number): Promise<GitLabMergeRequest> {
    try {
      const response = await this.api.get(`/projects/${projectId}/merge_requests/${mergeRequestIid}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch merge request ${projectId}!${mergeRequestIid}:`, error);
      throw error;
    }
  }

  async createMergeRequestNote(projectId: number, mergeRequestIid: number, body: string): Promise<void> {
    try {
      await this.api.post(`/projects/${projectId}/merge_requests/${mergeRequestIid}/notes`, {
        body,
      });
      logger.info(`Created note on MR ${projectId}!${mergeRequestIid}`);
    } catch (error) {
      logger.error(`Failed to create note on MR ${projectId}!${mergeRequestIid}:`, error);
      throw error;
    }
  }

  async createMergeRequestApproval(projectId: number, mergeRequestIid: number, body: string): Promise<void> {
    try {
      await this.api.post(`/projects/${projectId}/merge_requests/${mergeRequestIid}/approvals`, {
        body,
      });
      logger.info(`Created approval on MR ${projectId}!${mergeRequestIid}`);
    } catch (error) {
      logger.error(`Failed to create approval on MR ${projectId}!${mergeRequestIid}:`, error);
      throw error;
    }
  }

  async getRepositoryTree(projectId: number, path: string = '', ref: string = 'main'): Promise<any[]> {
    try {
      const response = await this.api.get(`/projects/${projectId}/repository/tree`, {
        params: {
          path,
          ref,
          recursive: true,
        },
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch tree for project ${projectId}:`, error);
      throw error;
    }
  }

  async getRepositoryFile(projectId: number, filePath: string, ref: string = 'main'): Promise<any> {
    try {
      const response = await this.api.get(`/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`, {
        params: {
          ref,
        },
      });
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch file ${filePath} for project ${projectId}:`, error);
      throw error;
    }
  }

  async createWebhook(projectId: number, webhookUrl: string, secret: string): Promise<void> {
    try {
      await this.api.post(`/projects/${projectId}/hooks`, {
        url: webhookUrl,
        merge_requests_events: true,
        push_events: true,
        token: secret,
      });
      logger.info(`Created webhook for project ${projectId}`);
    } catch (error) {
      logger.error(`Failed to create webhook for project ${projectId}:`, error);
      throw error;
    }
  }

  async deleteWebhook(projectId: number, hookId: number): Promise<void> {
    try {
      await this.api.delete(`/projects/${projectId}/hooks/${hookId}`);
      logger.info(`Deleted webhook ${hookId} for project ${projectId}`);
    } catch (error) {
      logger.error(`Failed to delete webhook ${hookId} for project ${projectId}:`, error);
      throw error;
    }
  }

  async getWebhooks(projectId: number): Promise<any[]> {
    try {
      const response = await this.api.get(`/projects/${projectId}/hooks`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch webhooks for project ${projectId}:`, error);
      throw error;
    }
  }

  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
