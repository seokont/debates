import { Injectable, Logger } from '@nestjs/common';
import {
  AttackVerification,
  DebateAttack,
  ThesisImprovement,
  VerificationStatus,
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
      '<РОЛЬ>: PARTIALLY - <причина одним предложением>',
      'или',
      '<РОЛЬ>: OPEN - <причина одним предложением>',
      '',
      'CLOSED — если тезис теперь явно учитывает суть атаки.',
      'PARTIALLY — если тезис частично адресует атаку, но не полностью закрывает проблему.',
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
        return this.buildVerification(attack, improvement, 'open', 'Verification result missing from AI response.', 0.5);
      }

      const closedMatch = /:\s*CLOSED\s*[-–—]\s*(.+)/i.exec(line);
      const partiallyMatch = /:\s*PARTIALLY\s*[-–—]\s*(.+)/i.exec(line);
      const openMatch = /:\s*OPEN\s*[-–—]\s*(.+)/i.exec(line);

      if (closedMatch) {
        return this.buildVerification(attack, improvement, 'closed', closedMatch[1].trim(), 0.82);
      }

      if (partiallyMatch) {
        return this.buildVerification(attack, improvement, 'partially', partiallyMatch[1].trim(), 0.70);
      }

      if (openMatch) {
        return this.buildVerification(attack, improvement, 'open', openMatch[1].trim(), 0.80);
      }

      return this.buildVerification(attack, improvement, 'open', line, 0.5);
    });
  }

  private buildVerification(
    attack: DebateAttack,
    improvement: ThesisImprovement,
    status: VerificationStatus,
    reason: string,
    confidence: number,
  ): AttackVerification {
    return {
      attackId: attack.id,
      roundNumber: improvement.roundNumber,
      provider: attack.provider,
      role: attack.role,
      model: attack.model,
      status,
      closed: status === 'closed',
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
      const matchCount = signal.filter((word) => improved.includes(word)).length;
      const totalSignals = signal.length;

      let status: VerificationStatus;
      if (improvement.changed && matchCount === totalSignals) {
        status = 'closed';
      } else if (improvement.changed && matchCount > 0) {
        status = 'partially';
      } else {
        status = 'open';
      }

      const statusLabel = status === 'closed'
        ? 'addresses'
        : status === 'partially'
          ? 'partially addresses'
          : 'does not address';

      return this.buildVerification(
        attack,
        improvement,
        status,
        `The new thesis ${statusLabel} the ${attack.role} attack.`,
        status === 'closed' ? 0.78 : status === 'partially' ? 0.55 : 0.42,
      );
    });
  }

  private roleSignal(role: DebateAttack['role']): string[] {
    switch (role) {
      case 'STRATEGIST':
        return ['timing', 'strategic', 'moment', 'window'];
      case 'SKEPTIC':
        return ['causal', 'assumptions', 'boundary'];
      case 'SYSTEMS_THINKER':
        return ['feedback', 'metrics', 'triggers'];
      case 'PRACTICIAN':
        return ['pilot', 'budget', 'constraints'];
      case 'SKEPTIC_INNOVATOR':
        return ['alternative', 'opposite', 'invert'];
      case 'OPPONENT':
        return ['rival', 'cost', 'failure'];
    }
  }
}
