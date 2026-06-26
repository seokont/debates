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
    // Per spec: "тот кто атаковал, проверяет" — each model verifies its own attack
    const byProvider = new Map<string, DebateAttack[]>();
    for (const attack of attacks) {
      const arr = byProvider.get(attack.provider) ?? [];
      arr.push(attack);
      byProvider.set(attack.provider, arr);
    }

    const results = await Promise.all(
      Array.from(byProvider.entries()).map(async ([provider, providerAttacks]) => {
        const attackLines = providerAttacks
          .map((a) => `[${a.role}]: ${a.content}`)
          .join('\n');

        const prompt = [
          'Ты проверяешь, была ли твоя идея интегрирована в синтез после раунда диалога.',
          'Это не дебат — участники вносят вклад, а синтез их интегрирует.',
          '',
          `СИНТЕЗ: ${improvement.improvedThesis}`,
          '',
          'ТВОИ ВКЛАДЫ:',
          attackLines,
          '',
          'Для каждого вклада ответь строго в формате:',
          '<РОЛЬ>: CLOSED - <как именно твоя идея нашла отражение в синтезе>',
          'или',
          '<РОЛЬ>: PARTIALLY - <какая часть идеи вошла, что ещё не интегрировано>',
          'или',
          '<РОЛЬ>: OPEN - <почему идея ещё не нашла места в синтезе>',
          '',
          'CLOSED — если синтез явно включает суть твоей идеи или перспективы.',
          'PARTIALLY — если часть идеи интегрирована, но вопрос или механизм ещё открыт.',
          'OPEN — если твоя идея ещё не нашла отражения в синтезе.',
          '',
          'Только эти строки, никакого другого текста.',
        ].join('\n');

        try {
          const raw = await this.agentService.callProvider(provider as any, prompt, userId);
          return this.parseVerificationResponse(providerAttacks, improvement, raw);
        } catch {
          return this.keywordVerify(providerAttacks, improvement);
        }
      }),
    );

    return results.flat();
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
