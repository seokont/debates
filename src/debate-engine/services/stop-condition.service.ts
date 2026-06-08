import { Injectable } from '@nestjs/common';
import { Debate } from '@prisma/client';
import {
  AttackVerification,
  StopConditionResult,
  ThesisImprovement,
} from '../types/ai-agent.type';

const NO_IMPROVEMENT_THRESHOLD = 3;

@Injectable()
export class StopConditionService {
  evaluate(
    debate: Debate,
    improvement: ThesisImprovement,
    verifications: AttackVerification[],
    recentScores: (number | null)[] = [],
  ): StopConditionResult {
    if (improvement.roundNumber >= debate.maxRounds) {
      return {
        shouldStop: true,
        reason: 'MAX_ROUNDS_REACHED',
      };
    }

    if (!improvement.changed) {
      return {
        shouldStop: true,
        reason: 'THESIS_DID_NOT_CHANGE',
      };
    }

    if (verifications.length === 0) {
      return {
        shouldStop: true,
        reason: 'NO_ATTACKS_GENERATED',
      };
    }

    const allAttacksClosed = verifications.every(
      (verification) => verification.closed,
    );
    const minimumClosureRound = Math.min(2, debate.maxRounds);

    if (allAttacksClosed && improvement.roundNumber >= minimumClosureRound) {
      return {
        shouldStop: true,
        reason: 'ALL_ATTACKS_CLOSED',
      };
    }

    if (this.noImprovementForNRounds(recentScores, NO_IMPROVEMENT_THRESHOLD)) {
      return {
        shouldStop: true,
        reason: `NO_IMPROVEMENT_FOR_${NO_IMPROVEMENT_THRESHOLD}_ROUNDS`,
      };
    }

    return {
      shouldStop: false,
      reason: 'CONTINUE',
    };
  }

  private noImprovementForNRounds(
    scores: (number | null)[],
    n: number,
  ): boolean {
    if (scores.length < n) {
      return false;
    }

    const lastN = scores.slice(-n);
    return lastN.every((score) => score === null || score === 0);
  }
}
