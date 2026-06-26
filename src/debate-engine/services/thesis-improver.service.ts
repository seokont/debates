import { Injectable, Logger } from '@nestjs/common';
import { Debate } from '@prisma/client';
import { AgentService } from './agent.service';
import { DebateAttack, ThesisImprovement } from '../types/ai-agent.type';

@Injectable()
export class ThesisImproverService {
  private readonly logger = new Logger(ThesisImproverService.name);

  constructor(private readonly agentService: AgentService) {}

  async improve(
    debate: Debate,
    roundNumber: number,
    attacks: DebateAttack[],
    userId?: string,
  ): Promise<ThesisImprovement> {
    try {
      return await this.improveWithAi(debate, roundNumber, attacks, userId);
    } catch (error) {
      this.logger.warn(
        `AI thesis improvement failed, using deterministic fallback: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.deterministicImprove(debate, roundNumber, attacks);
    }
  }

  private async improveWithAi(
    debate: Debate,
    roundNumber: number,
    attacks: DebateAttack[],
    userId?: string,
  ): Promise<ThesisImprovement> {
    const attackLines = attacks
      .map((a) => `[${a.role}]: ${a.content}`)
      .join('\n');

    const prompt = [
      'Ты улучшаешь тезис после раунда атак от AI-критиков.',
      '',
      `ИСХОДНЫЙ ТЕЗИС: ${debate.originalThesis}`,
      `ТЕКУЩИЙ ТЕЗИС: ${debate.currentThesis}`,
      '',
      `АТАКИ В РАУНДЕ ${roundNumber}:`,
      attackLines,
      '',
      'Улучши тезис. Ответ ОБЯЗАН содержать ровно три блока и улучшенный тезис:',
      '',
      '[1] ИЗМЕНИЛОСЬ: что конкретно изменилось (одно предложение)',
      '[2] ЗАКРЫТО: какая атака закрыта (укажи роль)',
      '[3] ЕЩЁ СЛАБО: что всё ещё слабо или не решено (честно)',
      '',
      'УЛУЧШЕННЫЙ_ТЕЗИС: <новый тезис одним абзацем>',
      '',
      'Требования:',
      '- Тезис должен стать конкретнее, не длиннее',
      '- Нельзя просто добавить "зависит от контекста"',
      '- Нельзя уклоняться от конкретных атак',
    ].join('\n');

    const raw = await this.agentService.callProvider('anthropic', prompt, userId);
    return this.parseAiResponse(debate.currentThesis, roundNumber, raw);
  }

  private parseAiResponse(
    previousThesis: string,
    roundNumber: number,
    raw: string,
  ): ThesisImprovement {
    const improvedThesis = this.extractSection(raw, 'УЛУЧШЕННЫЙ_ТЕЗИС') ??
      this.extractSection(raw, 'IMPROVED_THESIS') ??
      this.extractSection(raw, 'IMPROVED THESIS') ??
      this.extractLastParagraph(raw);

    const changed = this.extractSection(raw, '[1] ИЗМЕНИЛОСЬ') ??
      this.extractSection(raw, '[1] CHANGED') ?? '';
    const closed = this.extractSection(raw, '[2] ЗАКРЫТО') ??
      this.extractSection(raw, '[2] CLOSED') ?? '';
    const stillWeak = this.extractSection(raw, '[3] ЕЩЁ СЛАБО') ??
      this.extractSection(raw, '[3] STILL_WEAK') ??
      this.extractSection(raw, '[3] STILL WEAK') ?? '';

    const summary = [changed, closed, stillWeak]
      .filter(Boolean)
      .join(' | ')
      .trim() || `Round ${roundNumber} AI improvement`;

    const thesis = improvedThesis?.trim() || previousThesis;

    return {
      roundNumber,
      previousThesis,
      improvedThesis: thesis,
      summary,
      changed: thesis !== previousThesis && thesis.length > 0,
    };
  }

  private extractSection(text: string, label: string): string | undefined {
    const escaped = label.replace(/[[\]().*+?^${}|\\]/g, '\\$&');
    const pattern = new RegExp(
      `${escaped}[:\\s]+((?:(?!\\[\\d\\]|УЛУЧШЕННЫЙ_ТЕЗИС|IMPROVED)[^\\n]|\\n(?!\\n))+)`,
      'i',
    );
    const match = text.match(pattern);
    return match?.[1]?.trim() || undefined;
  }

  private extractLastParagraph(text: string): string | undefined {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    return paragraphs[paragraphs.length - 1];
  }

  private deterministicImprove(
    debate: Debate,
    roundNumber: number,
    attacks: DebateAttack[],
  ): ThesisImprovement {
    const previousThesis = debate.currentThesis.trim();
    const safeguards = attacks.map((attack) => this.toSafeguard(attack));
    const improvedThesis = [
      previousThesis,
      '',
      `Round ${roundNumber} refinement:`,
      ...safeguards.map((safeguard) => `- ${safeguard}`),
    ].join('\n');

    return {
      roundNumber,
      previousThesis,
      improvedThesis,
      summary: `Added ${safeguards.length} safeguards against attacks in round ${roundNumber}.`,
      changed: improvedThesis !== previousThesis,
    };
  }

  private toSafeguard(attack: DebateAttack): string {
    switch (attack.role) {
      case 'STRATEGIST':
        return 'Justify the strategic timing and explain why this specific approach is the right one for the current moment.';
      case 'SKEPTIC':
        return 'Clarify the causal mechanism, assumptions, and boundary conditions before treating the thesis as proven.';
      case 'SYSTEMS_THINKER':
        return 'Track second and third order feedback loops with early warning metrics and explicit reversal triggers.';
      case 'PRACTICIAN':
        return 'Validate the claim with a small operational pilot, including budget, skills, timing, and adoption constraints.';
      case 'SKEPTIC_INNOVATOR':
        return 'Address the inverted assumption or alternative system and explain why the thesis holds despite the opposite scenario.';
      case 'OPPONENT':
        return 'Compare the thesis against at least one rival design on cost, speed, resilience, and failure modes.';
    }
  }
}
