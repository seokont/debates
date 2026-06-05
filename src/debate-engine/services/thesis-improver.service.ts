import { Injectable } from '@nestjs/common';
import { Debate } from '@prisma/client';
import { DebateAttack, ThesisImprovement } from '../types/ai-agent.type';

@Injectable()
export class ThesisImproverService {
  improve(
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
      summary: `Added ${safeguards.length} safeguards against the strongest attacks in round ${roundNumber}.`,
      changed: improvedThesis !== previousThesis,
    };
  }

  private toSafeguard(attack: DebateAttack): string {
    switch (attack.role) {
      case 'SKEPTIC':
        return 'Clarify the causal mechanism, assumptions, and boundary conditions before treating the thesis as proven.';
      case 'SYSTEMS_THINKER':
        return 'Track second and third order feedback loops with early warning metrics and explicit reversal triggers.';
      case 'PRACTICIAN':
        return 'Validate the claim with a small operational pilot, including budget, skills, timing, and adoption constraints.';
      case 'OPPONENT':
        return 'Compare the thesis against at least one rival design on cost, speed, resilience, and failure modes.';
    }
  }
}

