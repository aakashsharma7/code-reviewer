import { ESLint } from 'eslint';
import { logger } from '@/utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ESLintIssue {
  ruleId: string;
  severity: 0 | 1 | 2; // 0 = off, 1 = warn, 2 = error
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  nodeType?: string;
  messageId?: string;
  end?: number;
  fix?: {
    range: [number, number];
    text: string;
  };
  suggestions?: Array<{
    desc: string;
    fix: {
      range: [number, number];
      text: string;
    };
  }>;
}

export interface ESLintResult {
  filePath: string;
  messages: ESLintIssue[];
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
  usedDeprecatedRules: Array<{
    ruleId: string;
    replacedBy: string[];
  }>;
}

export interface ESLintConfig {
  extends?: string[];
  parser?: string;
  parserOptions?: {
    ecmaVersion?: number;
    sourceType?: 'script' | 'module';
    ecmaFeatures?: {
      jsx?: boolean;
      globalReturn?: boolean;
      impliedStrict?: boolean;
    };
  };
  env?: {
    [key: string]: boolean;
  };
  globals?: {
    [key: string]: boolean | 'readonly' | 'writable' | 'readable' | 'writeable';
  };
  plugins?: string[];
  rules?: {
    [key: string]: any;
  };
  settings?: {
    [key: string]: any;
  };
}

export class ESLintService {
  private eslint: ESLint;
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'code-reviewer-eslint');
    this.ensureTempDir();
    
    this.eslint = new ESLint({
      useEslintrc: false,
      baseConfig: this.getDefaultConfig(),
    });
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private getDefaultConfig(): ESLintConfig {
    return {
      env: {
        browser: true,
        es2021: true,
        node: true,
      },
      extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
      ],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 12,
        sourceType: 'module',
      },
      plugins: ['@typescript-eslint'],
      rules: {
        // Common rules for code quality
        'no-unused-vars': 'warn',
        'no-console': 'warn',
        'no-debugger': 'error',
        'no-alert': 'error',
        'no-var': 'error',
        'prefer-const': 'error',
        'no-duplicate-imports': 'error',
        'no-unreachable': 'error',
        'no-undef': 'error',
        'no-unused-expressions': 'warn',
        'no-constant-condition': 'error',
        'no-empty': 'warn',
        'no-extra-semi': 'error',
        'no-func-assign': 'error',
        'no-import-assign': 'error',
        'no-invalid-regexp': 'error',
        'no-irregular-whitespace': 'error',
        'no-obj-calls': 'error',
        'no-redeclare': 'error',
        'no-sparse-arrays': 'error',
        'no-unexpected-multiline': 'error',
        'use-isnan': 'error',
        'valid-typeof': 'error',
        
        // TypeScript specific rules
        '@typescript-eslint/no-unused-vars': 'warn',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-inferrable-types': 'off',
        '@typescript-eslint/no-non-null-assertion': 'warn',
        '@typescript-eslint/prefer-as-const': 'error',
        '@typescript-eslint/no-array-constructor': 'error',
        '@typescript-eslint/no-empty-function': 'warn',
        '@typescript-eslint/no-extra-non-null-assertion': 'error',
        '@typescript-eslint/no-misused-new': 'error',
        '@typescript-eslint/no-namespace': 'error',
        '@typescript-eslint/no-this-alias': 'error',
        '@typescript-eslint/no-var-requires': 'error',
        '@typescript-eslint/prefer-namespace-keyword': 'error',
        '@typescript-eslint/triple-slash-reference': 'error',
      },
    };
  }

  async analyzeCode(sourceCode: string, filename: string, customConfig?: ESLintConfig): Promise<ESLintResult[]> {
    try {
      // Create temporary file
      const tempFilePath = path.join(this.tempDir, filename);
      fs.writeFileSync(tempFilePath, sourceCode);

      // Create ESLint instance with custom config if provided
      const eslint = customConfig 
        ? new ESLint({
            useEslintrc: false,
            baseConfig: customConfig,
          })
        : this.eslint;

      // Lint the file
      const results = await eslint.lintFiles([tempFilePath]);

      // Clean up temporary file
      fs.unlinkSync(tempFilePath);

      return results;
    } catch (error) {
      logger.error(`ESLint analysis failed for ${filename}:`, error);
      throw error;
    }
  }

  async analyzeMultipleFiles(files: Array<{ content: string; filename: string }>, customConfig?: ESLintConfig): Promise<ESLintResult[]> {
    try {
      const tempFiles: string[] = [];
      const filePaths: string[] = [];

      // Create temporary files
      for (const file of files) {
        const tempFilePath = path.join(this.tempDir, file.filename);
        fs.writeFileSync(tempFilePath, file.content);
        tempFiles.push(tempFilePath);
        filePaths.push(tempFilePath);
      }

      // Create ESLint instance with custom config if provided
      const eslint = customConfig 
        ? new ESLint({
            useEslintrc: false,
            baseConfig: customConfig,
          })
        : this.eslint;

      // Lint all files
      const results = await eslint.lintFiles(filePaths);

      // Clean up temporary files
      tempFiles.forEach(filePath => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      return results;
    } catch (error) {
      logger.error('ESLint analysis failed for multiple files:', error);
      throw error;
    }
  }

  async fixCode(sourceCode: string, filename: string, customConfig?: ESLintConfig): Promise<{ fixed: boolean; output: string; messages: ESLintIssue[] }> {
    try {
      // Create temporary file
      const tempFilePath = path.join(this.tempDir, filename);
      fs.writeFileSync(tempFilePath, sourceCode);

      // Create ESLint instance with custom config if provided
      const eslint = customConfig 
        ? new ESLint({
            useEslintrc: false,
            baseConfig: customConfig,
            fix: true,
          })
        : new ESLint({
            useEslintrc: false,
            baseConfig: this.getDefaultConfig(),
            fix: true,
          });

      // Lint and fix the file
      const results = await eslint.lintFiles([tempFilePath]);
      const result = results[0];

      // Read the fixed content
      const fixedContent = fs.readFileSync(tempFilePath, 'utf8');

      // Clean up temporary file
      fs.unlinkSync(tempFilePath);

      return {
        fixed: result.fixableErrorCount > 0 || result.fixableWarningCount > 0,
        output: fixedContent,
        messages: result.messages,
      };
    } catch (error) {
      logger.error(`ESLint fix failed for ${filename}:`, error);
      throw error;
    }
  }

  async getAvailableRules(): Promise<Map<string, any>> {
    try {
      const rules = await this.eslint.getRules();
      return rules;
    } catch (error) {
      logger.error('Failed to get ESLint rules:', error);
      throw error;
    }
  }

  async validateConfig(config: ESLintConfig): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const eslint = new ESLint({
        useEslintrc: false,
        baseConfig: config,
      });

      // Try to create a temporary file and lint it to validate the config
      const tempFilePath = path.join(this.tempDir, 'config-test.js');
      fs.writeFileSync(tempFilePath, '// Test file for config validation');

      try {
        await eslint.lintFiles([tempFilePath]);
        fs.unlinkSync(tempFilePath);
        return { valid: true, errors: [] };
      } catch (error) {
        fs.unlinkSync(tempFilePath);
        return { valid: false, errors: [error.message] };
      }
    } catch (error) {
      logger.error('Failed to validate ESLint config:', error);
      return { valid: false, errors: [error.message] };
    }
  }

  async generateReport(results: ESLintResult[]): Promise<{
    summary: {
      totalFiles: number;
      totalErrors: number;
      totalWarnings: number;
      totalFixableErrors: number;
      totalFixableWarnings: number;
    };
    files: Array<{
      filePath: string;
      errorCount: number;
      warningCount: number;
      messages: ESLintIssue[];
    }>;
  }> {
    const summary = {
      totalFiles: results.length,
      totalErrors: results.reduce((sum, result) => sum + result.errorCount, 0),
      totalWarnings: results.reduce((sum, result) => sum + result.warningCount, 0),
      totalFixableErrors: results.reduce((sum, result) => sum + result.fixableErrorCount, 0),
      totalFixableWarnings: results.reduce((sum, result) => sum + result.fixableWarningCount, 0),
    };

    const files = results.map(result => ({
      filePath: result.filePath,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      messages: result.messages,
    }));

    return { summary, files };
  }

  cleanup(): void {
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      logger.error('Failed to cleanup ESLint temp directory:', error);
    }
  }
}
