import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type CascadeResult = {
  architecture: string;
  code: string;
  review: string;
  audit: string;
  stack: string[];
  passed: boolean;
};

@Injectable()
export class CascadeAgentService {
  private readonly logger = new Logger(CascadeAgentService.name);

  constructor(private readonly config: ConfigService) {}

  async buildMvp(thesis: string, projectTitle: string): Promise<CascadeResult> {
    const architecture = await this.runArchitect(thesis, projectTitle);
    const code = await this.runCoder(thesis, projectTitle, architecture);
    const review = await this.runReviewer(code, architecture);
    const audit = await this.runAuditor(code, review, thesis);
    const passed = this.isAuditPassed(audit);

    return { architecture, code, review, audit, stack: this.extractStack(architecture), passed };
  }

  private async runArchitect(thesis: string, title: string): Promise<string> {
    const prompt = [
      `You are a software architect designing an MVP for: "${title}"`,
      `Core thesis: ${thesis}`,
      '',
      'Design a minimal MVP architecture. Respond with:',
      'STACK: comma-separated tech choices (e.g., "Next.js, Supabase, Stripe")',
      'ARCHITECTURE: 3-5 sentence description of how it works',
      'MVP_SCOPE: the single core feature that proves the concept',
      'SCHEMA: 2-3 database tables/models needed',
    ].join('\n');

    return this.callOpenAiCompat('openai', prompt);
  }

  private async runCoder(thesis: string, title: string, architecture: string): Promise<string> {
    const prompt = [
      `Generate skeleton code for MVP: "${title}"`,
      `Architecture: ${architecture}`,
      '',
      'Write the core backend API endpoint and one frontend component.',
      'Use TypeScript. Keep it under 80 lines total.',
      'Focus on the single most important user action.',
    ].join('\n');

    return this.callOpenAiCompat('deepseek', prompt);
  }

  private async runReviewer(code: string, architecture: string): Promise<string> {
    const prompt = [
      'Review this code for bugs, security issues, and architectural problems.',
      '',
      `ARCHITECTURE: ${architecture}`,
      `CODE:\n${code}`,
      '',
      'List findings in format:',
      'CRITICAL: [issue] | MEDIUM: [issue] | LOW: [issue]',
      'If none found, write: NO_CRITICAL_ISSUES',
    ].join('\n');

    return this.callOpenAiCompat('kimi', prompt);
  }

  private async runAuditor(code: string, review: string, thesis: string): Promise<string> {
    const prompt = [
      'You are doing a final security and compliance audit.',
      `THESIS: ${thesis}`,
      `CODE: ${code.slice(0, 3000)}`,
      `REVIEWER FINDINGS: ${review}`,
      '',
      'Check: GDPR, auth security, SQL injection, XSS, rate limiting.',
      'End with: AUDIT: PASSED or AUDIT: FAILED — reason',
    ].join('\n');

    return this.callOpenAiCompat('anthropic', prompt);
  }

  private async callOpenAiCompat(
    provider: 'openai' | 'deepseek' | 'kimi' | 'anthropic',
    prompt: string,
  ): Promise<string> {
    if (provider === 'anthropic') {
      return this.callAnthropic(prompt);
    }

    const { url, apiKey, model } = this.getProviderConfig(provider);

    if (!apiKey) {
      this.logger.warn(`${provider} API key not configured, using placeholder`);
      return `[${provider} response — API key not configured]`;
    }

    const response = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`${provider} error ${response.status}: ${await response.text()}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return body.choices?.[0]?.message?.content?.trim() ?? '';
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY not configured');
      return '[Claude audit — API key not configured]';
    }

    const model = this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5';
    const version = this.config.get<string>('ANTHROPIC_VERSION') ?? '2023-06-01';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': version,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic error: ${response.status}`);
    }

    const body = (await response.json()) as { content?: Array<{ text?: string }> };
    return body.content?.[0]?.text?.trim() ?? '';
  }

  private getProviderConfig(provider: string): { url: string; apiKey: string; model: string } {
    switch (provider) {
      case 'deepseek':
        return {
          url: 'https://api.deepseek.com/v1',
          apiKey: this.config.get<string>('DEEPSEEK_API_KEY') ?? '',
          model: this.config.get<string>('DEEPSEEK_MODEL') ?? 'deepseek-chat',
        };
      case 'kimi':
        return {
          url: 'https://api.moonshot.cn/v1',
          apiKey: this.config.get<string>('KIMI_API_KEY') ?? '',
          model: this.config.get<string>('KIMI_MODEL') ?? 'moonshot-v1-8k',
        };
      default:
        return {
          url: 'https://api.openai.com/v1',
          apiKey: this.config.get<string>('OPENAI_API_KEY') ?? '',
          model: this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini',
        };
    }
  }

  private isAuditPassed(audit: string): boolean {
    return /AUDIT:\s*PASSED/i.test(audit);
  }

  private extractStack(architecture: string): string[] {
    const match = architecture.match(/STACK:\s*(.+)/i);
    if (!match) return [];
    return match[1].split(',').map((s) => s.trim()).filter(Boolean);
  }
}
