import { Injectable } from '@nestjs/common';
import {
  AttackVerification,
  DebateAttack,
  ThesisImprovement,
} from '../types/ai-agent.type';

@Injectable()
export class VerificationService {
  verify(
    attacks: DebateAttack[],
    improvement: ThesisImprovement,
  ): AttackVerification[] {
    const improved = improvement.improvedThesis.toLowerCase();

    return attacks.map((attack) => {
      const signal = this.roleSignal(attack.role);
      const closed = improvement.changed && signal.every((word) => improved.includes(word));

      return {
        attackId: attack.id,
        roundNumber: improvement.roundNumber,
        provider: attack.provider,
        role: attack.role,
        model: attack.model,
        closed,
        reason: closed
          ? `The new thesis now addresses the ${attack.role} attack with explicit mitigation.`
          : `The new thesis still does not address the ${attack.role} attack strongly enough.`,
        confidence: closed ? 0.78 : 0.42,
      };
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

