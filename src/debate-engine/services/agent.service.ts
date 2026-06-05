import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProvider as UserAiProvider,
  DebateAiModel,
} from '@prisma/client';
import { SettingsService } from '../../settings/settings.service';
import {
  AiAgent,
  AiAgentResponse,
  AiAgentRole,
  AiProvider,
} from '../types/ai-agent.type';

type OpenAiResponseBody = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
};

type AnthropicResponseBody = {
  content?: Array<{
    text?: string;
    type?: string;
  }>;
};

type GeminiResponseBody = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  getAgents(models: DebateAiModel[], userId?: string): AiAgent[] {
    const selectedModels =
      models.length > 0
        ? models
        : [
            DebateAiModel.GPT,
            DebateAiModel.CLAUDE,
            DebateAiModel.GEMINI,
            DebateAiModel.GROK,
          ];

    return selectedModels.map((model) => ({
      provider: this.getProvider(model),
      role: this.getRole(model),
      model,
      run: (prompt: string) =>
        this.runRole(
          this.getProvider(model),
          this.getRole(model),
          model,
          prompt,
          userId,
        ),
    }));
  }

  runAgents(
    models: DebateAiModel[],
    prompt: string | ((agent: AiAgent) => string),
    userId?: string,
  ): Promise<AiAgentResponse[]> {
    const agents = this.getAgents(models, userId);

    return Promise.all(
      agents.map((agent) =>
        agent.run(typeof prompt === 'function' ? prompt(agent) : prompt),
      ),
    );
  }

  private async runRole(
    provider: AiProvider,
    role: AiAgentRole,
    model: DebateAiModel,
    prompt: string,
    userId?: string,
  ): Promise<AiAgentResponse> {
    const startedAt = Date.now();
    const fallbackOnError =
      this.config.get<string>('DEBATE_AGENT_FALLBACK_ON_ERROR') !== 'false';

    try {
      const content = await this.runProviderWithRetry(provider, prompt, userId);

      return {
        provider,
        role,
        model,
        content,
        latencyMs: Date.now() - startedAt,
        usedFallback: false,
      };
    } catch (error) {
      if (!fallbackOnError) {
        throw error;
      }

      return {
        provider,
        role,
        model,
        content: this.localAttack(role, prompt),
        latencyMs: Date.now() - startedAt,
        usedFallback: true,
      };
    }
  }

  private getProvider(model: DebateAiModel): AiProvider {
    switch (model) {
      case DebateAiModel.GPT:
        return 'openai';
      case DebateAiModel.CLAUDE:
        return 'anthropic';
      case DebateAiModel.GEMINI:
        return 'google';
      case DebateAiModel.GROK:
        return 'xai';
    }
  }

  private getRole(model: DebateAiModel): AiAgentRole {
    switch (model) {
      case DebateAiModel.GPT:
        return 'SKEPTIC';
      case DebateAiModel.CLAUDE:
        return 'SYSTEMS_THINKER';
      case DebateAiModel.GEMINI:
        return 'PRACTICIAN';
      case DebateAiModel.GROK:
        return 'OPPONENT';
    }
  }

  private runProvider(
    provider: AiProvider,
    prompt: string,
    userId?: string,
  ): Promise<string> {
    switch (provider) {
      case 'openai':
        return this.runOpenAi(prompt, userId);
      case 'anthropic':
        return this.runAnthropic(prompt, userId);
      case 'google':
        return this.runGemini(prompt, userId);
      case 'xai':
        return this.runXAi(prompt, userId);
    }
  }

  private async runProviderWithRetry(
    provider: AiProvider,
    prompt: string,
    userId?: string,
  ): Promise<string> {
    const maxAttempts = this.getRetryAttempts();
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.runProvider(provider, prompt, userId);
      } catch (error) {
        lastError = error;

        if (attempt >= maxAttempts || !this.isRetryableProviderError(error)) {
          throw error;
        }

        const delayMs = this.getRetryDelayMs(attempt);
        this.logger.warn(
          `${provider} request failed temporarily; retrying in ${delayMs}ms (${attempt}/${maxAttempts})`,
        );
        await this.sleep(delayMs);
      }
    }

    throw lastError;
  }

  private async runOpenAi(prompt: string, userId?: string): Promise<string> {
    const apiKey = await this.getProviderApiKey(
      userId,
      UserAiProvider.OPENAI,
      'OPENAI_API_KEY',
    );
    const model = this.getOptionalConfig('OPENAI_MODEL', 'gpt-4o-mini');
    const maxOutputTokens = this.getMaxOutputTokens();

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: maxOutputTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${await this.readError(response)}`);
    }

    const body = (await response.json()) as OpenAiResponseBody;
    const text = this.extractOpenAiText(body);

    if (!text) {
      throw new Error('OpenAI response did not include text output');
    }

    return text.trim();
  }

  private async runAnthropic(prompt: string, userId?: string): Promise<string> {
    const apiKey = await this.getProviderApiKey(
      userId,
      UserAiProvider.ANTHROPIC,
      'ANTHROPIC_API_KEY',
    );
    const model = this.getOptionalConfig('ANTHROPIC_MODEL', 'claude-sonnet-4-5');
    const version = this.getOptionalConfig('ANTHROPIC_VERSION', '2023-06-01');
    const maxOutputTokens = this.getMaxOutputTokens();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': version,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxOutputTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Anthropic request failed: ${await this.readError(response)}`,
      );
    }

    const body = (await response.json()) as AnthropicResponseBody;
    const text = this.extractAnthropicText(body);

    if (!text) {
      throw new Error('Anthropic response did not include text output');
    }

    return text.trim();
  }

  private async runGemini(prompt: string, userId?: string): Promise<string> {
    const apiKey = await this.getProviderApiKey(
      userId,
      UserAiProvider.GOOGLE,
      'GEMINI_API_KEY',
    );
    const model = this.getOptionalConfig('GEMINI_MODEL', 'gemini-3.5-flash');
    const maxOutputTokens = this.getMaxOutputTokens();
    const modelPath = this.toGeminiModelPath(model);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini request failed: ${await this.readError(response)}`);
    }

    const body = (await response.json()) as GeminiResponseBody;
    const text = this.extractGeminiText(body);

    if (!text) {
      throw new Error('Gemini response did not include text output');
    }

    return text.trim();
  }

  private async runXAi(prompt: string, userId?: string): Promise<string> {
    const apiKey = await this.getProviderApiKey(
      userId,
      UserAiProvider.XAI,
      'XAI_API_KEY',
    );
    const model = this.getOptionalConfig('XAI_MODEL', 'grok-4.3');
    const maxOutputTokens = this.getMaxOutputTokens();

    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: prompt,
        max_output_tokens: maxOutputTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`xAI request failed: ${await this.readError(response)}`);
    }

    const body = (await response.json()) as OpenAiResponseBody;
    const text = this.extractOpenAiText(body);

    if (!text) {
      throw new Error('xAI response did not include text output');
    }

    return text.trim();
  }

  private extractOpenAiText(body: OpenAiResponseBody): string {
    if (typeof body.output_text === 'string') {
      return body.output_text;
    }

    return (
      body.output
        ?.flatMap((item) => item.content ?? [])
        .map((content) => content.text)
        .filter((text): text is string => typeof text === 'string')
        .join('\n') ?? ''
    );
  }

  private extractAnthropicText(body: AnthropicResponseBody): string {
    return (
      body.content
        ?.map((content) => content.text)
        .filter((text): text is string => typeof text === 'string')
        .join('\n') ?? ''
    );
  }

  private extractGeminiText(body: GeminiResponseBody): string {
    return (
      body.candidates
        ?.flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => part.text)
        .filter((text): text is string => typeof text === 'string')
        .join('\n') ?? ''
    );
  }

  private toGeminiModelPath(model: string): string {
    const modelName = model.startsWith('models/')
      ? model.slice('models/'.length)
      : model;

    return `models/${encodeURIComponent(modelName)}`;
  }

  private getRequiredConfig(name: string): string {
    const value = this.config.get<string>(name)?.trim();

    if (!value) {
      throw new Error(`${name} is not configured`);
    }

    return value;
  }

  private async getProviderApiKey(
    userId: string | undefined,
    provider: UserAiProvider,
    envName: string,
  ): Promise<string> {
    const userApiKey = userId
      ? await this.settingsService.getActiveApiKey(userId, provider)
      : null;

    return userApiKey || this.getRequiredConfig(envName);
  }

  private getOptionalConfig(name: string, fallback: string): string {
    return this.config.get<string>(name)?.trim() || fallback;
  }

  private getMaxOutputTokens(): number {
    const value = Number(
      this.config.get<string>('DEBATE_AGENT_MAX_OUTPUT_TOKENS') ?? 450,
    );

    return Number.isFinite(value) && value > 0 ? value : 450;
  }

  private getRetryAttempts(): number {
    const value = Number(
      this.config.get<string>('DEBATE_AGENT_RETRY_ATTEMPTS') ?? 3,
    );

    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 3;
  }

  private getRetryDelayMs(attempt: number): number {
    const baseDelay = Number(
      this.config.get<string>('DEBATE_AGENT_RETRY_DELAY_MS') ?? 1000,
    );
    const safeBaseDelay =
      Number.isFinite(baseDelay) && baseDelay >= 0 ? baseDelay : 1000;

    return safeBaseDelay * 2 ** Math.max(0, attempt - 1);
  }

  private isRetryableProviderError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return /\b(429|500|502|503|504)\b/.test(error.message);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async readError(response: Response): Promise<string> {
    const detail = await response.text();

    return `${response.status} ${detail}`;
  }

  private localAttack(role: AiAgentRole, prompt: string): string {
    const thesis = this.extractCurrentThesis(prompt);

    switch (role) {
      case 'SKEPTIC':
        return [
          `Claim: "${thesis}" has an under-specified causal chain.`,
          'Why it matters: if the mechanism is vague, the thesis can look plausible while failing at the first missing link.',
          'Falsifier: show the concrete mechanism, boundary conditions, and one case where the mechanism should not work.',
        ].join(' ');
      case 'SYSTEMS_THINKER':
        return [
          `Claim: "${thesis}" may create a delayed second-order risk.`,
          'Why it matters: after adoption, incentives can shift and produce the opposite behavior from the intended one.',
          'Falsifier: map the three-step feedback loop and identify the metric that would warn before the reversal happens.',
        ].join(' ');
      case 'PRACTICIAN':
        return [
          `Claim: "${thesis}" may ignore execution constraints.`,
          'Why it matters: budget, skills, timing, regulation, and adoption friction can dominate theoretical correctness.',
          'Falsifier: define the smallest real-world pilot and the operational threshold it must clear.',
        ].join(' ');
      case 'OPPONENT':
        return [
          `Claim: an alternative system may solve the same problem better than "${thesis}".`,
          'Why it matters: the thesis is weaker if a simpler, cheaper, or more incentive-compatible design exists.',
          'Falsifier: compare the thesis against one rival design on cost, speed, resilience, and failure modes.',
        ].join(' ');
    }
  }

  private extractCurrentThesis(prompt: string): string {
    const match =
      prompt.match(/ТЕКУЩАЯ ВЕРСИЯ:\n([\s\S]*?)\n\nЗАКРЫТЫЕ АТАКИ:/i) ??
      prompt.match(/Current thesis:\n([\s\S]*?)\n\nPrevious/im);

    return match?.[1]?.trim().slice(0, 220) || 'the thesis';
  }
}
