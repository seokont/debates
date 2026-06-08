import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Agent = {
  name: string;
  role: string;
  question: string;
  provider: 'deepseek' | 'kimi' | 'anthropic' | 'openai';
};

const EIGHT_AGENTS: Agent[] = [
  { name: 'PRODUCT', role: 'Product', question: 'What do we build first?', provider: 'openai' },
  { name: 'TECH', role: 'Tech', question: 'Does this work? Is it deployable?', provider: 'deepseek' },
  { name: 'DESIGN', role: 'Design', question: 'Is this understandable in 5 seconds?', provider: 'kimi' },
  { name: 'GROWTH', role: 'Growth', question: 'Where are the first 100 users?', provider: 'openai' },
  { name: 'MARKETING', role: 'Marketing', question: 'Why will people buy?', provider: 'kimi' },
  { name: 'ECONOMICS', role: 'Economics', question: 'Does the math work?', provider: 'deepseek' },
  { name: 'PSYCHOLOGY', role: 'Psychology', question: 'Do people really want this or just say they do?', provider: 'openai' },
  { name: 'LEGAL', role: 'Legal', question: 'What could kill this in a year?', provider: 'anthropic' },
];

export type BuildStep = {
  agent: string;
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
};

export type FullBuildResult = {
  steps: BuildStep[];
  stack: string[];
  passed: boolean;
  auditNote: string;
  mvpScope: string;
};

@Injectable()
export class CascadeAgentService {
  private readonly logger = new Logger(CascadeAgentService.name);

  constructor(private readonly config: ConfigService) {}

  async buildMvp(thesis: string, projectTitle: string): Promise<FullBuildResult> {
    const steps: BuildStep[] = [];

    // Phase 1: Product scopes MVP
    const mvpScope = await this.runAgent(EIGHT_AGENTS[0], thesis, projectTitle, '');
    steps.push({ agent: 'PRODUCT', type: 'ARCHITECTURE', content: mvpScope });

    // Phase 2: Tech writes skeleton code
    const code = await this.runAgent(EIGHT_AGENTS[1], thesis, projectTitle, mvpScope);
    steps.push({ agent: 'TECH', type: 'CODE', content: code });

    // Phase 3: Design reviews UX
    const designReview = await this.runAgent(EIGHT_AGENTS[2], thesis, projectTitle, mvpScope + '\n\n' + code);
    steps.push({ agent: 'DESIGN', type: 'REVIEW', content: designReview });

    // Phase 4: Growth adds acquisition strategy
    const growthPlan = await this.runAgent(EIGHT_AGENTS[3], thesis, projectTitle, mvpScope);
    steps.push({ agent: 'GROWTH', type: 'REVIEW', content: growthPlan });

    // Phase 5: Marketing creates positioning
    const positioning = await this.runAgent(EIGHT_AGENTS[4], thesis, projectTitle, mvpScope + '\n\n' + growthPlan);
    steps.push({ agent: 'MARKETING', type: 'REVIEW', content: positioning });

    // Phase 6: Economics validates unit economics
    const economics = await this.runAgent(EIGHT_AGENTS[5], thesis, projectTitle, mvpScope + '\n\n' + growthPlan);
    steps.push({ agent: 'ECONOMICS', type: 'REVIEW', content: economics });

    // Phase 7: Psychology challenges demand assumptions
    const psychology = await this.runAgent(EIGHT_AGENTS[6], thesis, projectTitle, mvpScope + '\n\n' + designReview);
    steps.push({ agent: 'PSYCHOLOGY', type: 'REVIEW', content: psychology });

    // Phase 8: Legal identifies kill risks
    const legalReview = await this.runAgent(
      EIGHT_AGENTS[7],
      thesis,
      projectTitle,
      [mvpScope, code, economics, psychology].join('\n---\n'),
    );
    const passed = this.isAuditPassed(legalReview);
    steps.push({ agent: 'LEGAL', type: passed ? 'AUDIT_PASSED' : 'REVIEW', content: legalReview, metadata: { passed } });

    return {
      steps,
      stack: this.extractStack(mvpScope),
      passed,
      auditNote: legalReview,
      mvpScope,
    };
  }

  private async runAgent(
    agent: Agent,
    thesis: string,
    projectTitle: string,
    context: string,
  ): Promise<string> {
    const prompt = [
      `You are the ${agent.role} agent reviewing: "${projectTitle}"`,
      `Thesis: ${thesis}`,
      `Your key question: "${agent.question}"`,
      '',
      ...(context ? [`Context from previous agents:\n${context.slice(0, 2000)}`, ''] : []),
      `Answer your key question in 200-400 words. Be specific, actionable, critical.`,
      `If you find a blocker, start with BLOCKER: [description]`,
      `Otherwise start with your main finding.`,
    ].join('\n');

    try {
      return await this.callProvider(agent.provider, prompt);
    } catch (error) {
      this.logger.warn(`Agent ${agent.name} failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return `[${agent.name} unavailable — API key not configured]`;
    }
  }

  private async callProvider(provider: Agent['provider'], prompt: string): Promise<string> {
    if (provider === 'anthropic') return this.callAnthropic(prompt);

    const { url, apiKey, model } = this.getProviderConfig(provider);
    if (!apiKey) return `[${provider} not configured]`;

    const response = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 800,
      }),
    });

    if (!response.ok) throw new Error(`${provider} ${response.status}`);

    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content?.trim() ?? '';
  }

  private async callAnthropic(prompt: string): Promise<string> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) return '[Claude not configured]';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': this.config.get<string>('ANTHROPIC_VERSION') ?? '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.get<string>('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic ${response.status}`);
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
    return !/BLOCKER:/i.test(audit) && !/AUDIT:\s*FAILED/i.test(audit);
  }

  private extractStack(text: string): string[] {
    const match = text.match(/STACK:\s*(.+)/i);
    if (!match) return [];
    return match[1].split(',').map((s) => s.trim()).filter(Boolean);
  }
}
