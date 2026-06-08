import { Injectable, Logger } from '@nestjs/common';
import {
  AttackVerification,
  DebateAttack,
  ThesisImprovement,
} from '../types/ai-agent.type';
import { AgentService } from './agent.service';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(private readonly agentService: AgentService) {}

  async verify(
    attacks: DebateAttack[],
    improvement: ThesisImprovement,
    userId?: string,
  ): Promise<AttackVerification[]> {
    try {
      return await this.verifyWithAi(attacks, improvement, userId);
    } catch (error) {
      this.logger.warn(
        `AI verification failed, using keyword fallback: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.keywordVerify(attacks, improvement);
    }
  }

  private async verifyWithAi(
    attacks: DebateAttack[],
    improvement: ThesisImprovement,
    userId?: string,
  ): Promise<AttackVerification[]> {
    const attackLines = attacks
      .map((a) => `[${a.role}]: ${a.content}`)
      .join('\n');

    const prompt = [
      'Ты проверяешь, закрыты ли атаки на тезис после его улучшения.',
      '',
      `УЛУЧШЕННЫЙ ТЕЗИС: ${improvement.improvedThesis}`,
      '',
      'АТАКИ ДЛЯ ПРОВЕРКИ:',
      attackLines,
      '',
      'Для каждой атаки ответь строго в формате:',
      '<РОЛЬ>: CLOSED - <причина одним предложением>',
      'или',
      '<РОЛЬ>: OPEN - <причина одним предложением>',
      '',
      'CLOSED — если тезис теперь явно учитывает суть атаки.',
      'OPEN — если проблема по-прежнему не решена.',
      '',
      'Только эти строки, никакого другого текста.',
    ].join('\n');

    const raw = await this.agentService.callProvider('anthropic', prompt, userId);
    return this.parseVerificationResponse(attacks, improvement, raw);
  }

  private parseVerificationResponse(
    attacks: DebateAttack[],
    improvement: ThesisImprovement,
    raw: string,
  ): AttackVerification[] {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

    return attacks.map((attack) => {
      const line = lines.find((l) =>
        l.toUpperCase().startsWith(attack.role.toUpperCase()),
      );

      if (!line) {
        return this.buildVerification(attack, improvement, false, 'Verification result missing from AI response.', 0.5);
      }

      const closedMatch = /:\s*CLOSED\s*[-–—]\s*(.+)/i.exec(line);
      const openMatch = /:\s*OPEN\s*[-–—]\s*(.+)/i.exec(line);

      if (closedMatch) {
        return this.buildVerification(attack, improvement, true, closedMatch[1].trim(), 0.82);
      }

      if (openMatch) {
        return this.buildVerification(attack, improvement, false, openMatch[1].trim(), 0.80);
      }

      return this.buildVerification(attack, improvement, false, line, 0.5);
    });
  }

  private buildVerification(
    attack: DebateAttack,
    improvement: ThesisImprovement,
    closed: boolean,
    reason: string,
    confidence: number,
  ): AttackVerification {
    return {
      attackId: attack.id,
      roundNumber: improvement.roundNumber,
      provider: attack.provider,
      role: attack.role,
      model: attack.model,
      closed,
      reason,
      confidence,
    };
  }

  private keywordVerify(
    attacks: DebateAttack[],
    improvement: ThesisImprovement,
  ): AttackVerification[] {
    const improved = improvement.improvedThesis.toLowerCase();

    return attacks.map((attack) => {
      const signal = this.roleSignal(attack.role);
      const closed = improvement.changed && signal.every((word) => improved.includes(word));

      return this.buildVerification(
        attack,
        improvement,
        closed,
        closed
          ? `The new thesis now addresses the ${attack.role} attack with explicit mitigation.`
          : `The new thesis still does not address the ${attack.role} attack strongly enough.`,
        closed ? 0.78 : 0.42,
      );
    });
  }

  private roleSignal(role: DebateAttack['role']): string[] {
    switch (role) {
      case 'SKEPTIC':
        return ['causal', 'assumptions', 'boundary'];
      case 'SYSTEMS_THINKER':
        return ['feedback', 'metrics', 'triggers'];
      case 'PRACTICIAN':
        return ['pilot', 'budget', 'constraints'];
      case 'OPPONENT':
        return ['rival', 'cost', 'failure'];
    }
  }
}
