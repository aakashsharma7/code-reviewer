import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';

export interface SonarQubeIssue {
  key: string;
  rule: string;
  severity: 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER';
  component: string;
  project: string;
  line: number;
  column?: number;
  message: string;
  type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT';
  effort: string;
  debt: string;
  author?: string;
  creationDate: string;
  updateDate: string;
  tags: string[];
  flows: Array<{
    locations: Array<{
      component: string;
      textRange: {
        startLine: number;
        endLine: number;
        startOffset?: number;
        endOffset?: number;
      };
      msg?: string;
    }>;
  }>;
}

export interface SonarQubeProject {
  key: string;
  name: string;
  qualifier: string;
  visibility: string;
  lastAnalysisDate: string;
  revision: string;
}

export interface SonarQubeAnalysisResult {
  projectStatus: {
    status: 'OK' | 'WARN' | 'ERROR';
    conditions: Array<{
      status: 'OK' | 'WARN' | 'ERROR';
      metricKey: string;
      comparator: string;
      errorThreshold: string;
      actualValue: string;
    }>;
  };
  issues: SonarQubeIssue[];
  components: Array<{
    key: string;
    name: string;
    qualifier: string;
    path: string;
    language: string;
    measures: Array<{
      metric: string;
      value: string;
    }>;
  }>;
}

export class SonarQubeService {
  private api: AxiosInstance;
  private token: string;
  private baseUrl: string;

  constructor(token: string, baseUrl: string = 'http://localhost:9000') {
    this.token = token;
    this.baseUrl = baseUrl;
    this.api = axios.create({
      baseURL: `${baseUrl}/api`,
      auth: {
        username: token,
        password: '',
      },
      headers: {
        'User-Agent': 'Code-Reviewer-Platform/1.0',
      },
    });
  }

  async createProject(projectKey: string, projectName: string): Promise<void> {
    try {
      await this.api.post('/projects/create', {
        project: projectKey,
        name: projectName,
      });
      logger.info(`Created SonarQube project: ${projectKey}`);
    } catch (error) {
      logger.error(`Failed to create SonarQube project ${projectKey}:`, error);
      throw error;
    }
  }

  async deleteProject(projectKey: string): Promise<void> {
    try {
      await this.api.post('/projects/delete', {
        project: projectKey,
      });
      logger.info(`Deleted SonarQube project: ${projectKey}`);
    } catch (error) {
      logger.error(`Failed to delete SonarQube project ${projectKey}:`, error);
      throw error;
    }
  }

  async getProject(projectKey: string): Promise<SonarQubeProject> {
    try {
      const response = await this.api.get('/projects/search', {
        params: {
          projects: projectKey,
        },
      });
      
      if (response.data.components.length === 0) {
        throw new Error(`Project ${projectKey} not found`);
      }
      
      return response.data.components[0];
    } catch (error) {
      logger.error(`Failed to fetch SonarQube project ${projectKey}:`, error);
      throw error;
    }
  }

  async getProjects(): Promise<SonarQubeProject[]> {
    try {
      const response = await this.api.get('/projects/search');
      return response.data.components;
    } catch (error) {
      logger.error('Failed to fetch SonarQube projects:', error);
      throw error;
    }
  }

  async getProjectIssues(projectKey: string, branch?: string): Promise<SonarQubeIssue[]> {
    try {
      const params: any = {
        componentKeys: projectKey,
        ps: 500, // Page size
      };

      if (branch) {
        params.branch = branch;
      }

      const response = await this.api.get('/issues/search', { params });
      return response.data.issues;
    } catch (error) {
      logger.error(`Failed to fetch issues for project ${projectKey}:`, error);
      throw error;
    }
  }

  async getProjectMeasures(projectKey: string, metrics: string[], branch?: string): Promise<any> {
    try {
      const params: any = {
        component: projectKey,
        metricKeys: metrics.join(','),
      };

      if (branch) {
        params.branch = branch;
      }

      const response = await this.api.get('/measures/component', { params });
      return response.data.component;
    } catch (error) {
      logger.error(`Failed to fetch measures for project ${projectKey}:`, error);
      throw error;
    }
  }

  async getProjectStatus(projectKey: string, branch?: string): Promise<any> {
    try {
      const params: any = {
        projectKey,
      };

      if (branch) {
        params.branch = branch;
      }

      const response = await this.api.get('/qualitygates/project_status', { params });
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch project status for ${projectKey}:`, error);
      throw error;
    }
  }

  async generateToken(name: string, type: 'USER_TOKEN' | 'PROJECT_ANALYSIS_TOKEN' = 'USER_TOKEN'): Promise<string> {
    try {
      const response = await this.api.post('/user_tokens/generate', {
        name,
        type,
      });
      return response.data.token;
    } catch (error) {
      logger.error(`Failed to generate SonarQube token:`, error);
      throw error;
    }
  }

  async revokeToken(name: string): Promise<void> {
    try {
      await this.api.post('/user_tokens/revoke', {
        name,
      });
      logger.info(`Revoked SonarQube token: ${name}`);
    } catch (error) {
      logger.error(`Failed to revoke SonarQube token ${name}:`, error);
      throw error;
    }
  }

  async getQualityProfiles(): Promise<any[]> {
    try {
      const response = await this.api.get('/qualityprofiles/search');
      return response.data.profiles;
    } catch (error) {
      logger.error('Failed to fetch quality profiles:', error);
      throw error;
    }
  }

  async getQualityGates(): Promise<any[]> {
    try {
      const response = await this.api.get('/qualitygates/list');
      return response.data.qualitygates;
    } catch (error) {
      logger.error('Failed to fetch quality gates:', error);
      throw error;
    }
  }

  async analyzeProject(projectKey: string, sourceCode: string, branch?: string): Promise<SonarQubeAnalysisResult> {
    try {
      // This is a simplified version - in reality, you'd need to:
      // 1. Create a temporary directory with the source code
      // 2. Run SonarQube scanner
      // 3. Wait for analysis to complete
      // 4. Fetch the results

      logger.info(`Starting analysis for project ${projectKey}`);
      
      // For now, we'll simulate the analysis process
      // In a real implementation, you'd integrate with SonarQube Scanner
      
      const issues = await this.getProjectIssues(projectKey, branch);
      const projectStatus = await this.getProjectStatus(projectKey, branch);
      
      return {
        projectStatus,
        issues,
        components: [], // Would be populated by actual analysis
      };
    } catch (error) {
      logger.error(`Failed to analyze project ${projectKey}:`, error);
      throw error;
    }
  }

  async getIssueDetails(issueKey: string): Promise<SonarQubeIssue> {
    try {
      const response = await this.api.get('/issues/search', {
        params: {
          issues: issueKey,
        },
      });
      
      if (response.data.issues.length === 0) {
        throw new Error(`Issue ${issueKey} not found`);
      }
      
      return response.data.issues[0];
    } catch (error) {
      logger.error(`Failed to fetch issue details for ${issueKey}:`, error);
      throw error;
    }
  }

  async addIssueComment(issueKey: string, comment: string): Promise<void> {
    try {
      await this.api.post('/issues/add_comment', {
        issue: issueKey,
        text: comment,
      });
      logger.info(`Added comment to issue ${issueKey}`);
    } catch (error) {
      logger.error(`Failed to add comment to issue ${issueKey}:`, error);
      throw error;
    }
  }

  async resolveIssue(issueKey: string, resolution: string, comment?: string): Promise<void> {
    try {
      const params: any = {
        issue: issueKey,
        resolution,
      };

      if (comment) {
        params.comment = comment;
      }

      await this.api.post('/issues/do_transition', params);
      logger.info(`Resolved issue ${issueKey} with resolution ${resolution}`);
    } catch (error) {
      logger.error(`Failed to resolve issue ${issueKey}:`, error);
      throw error;
    }
  }
}
