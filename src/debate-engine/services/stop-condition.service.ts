import { Injectable } from '@nestjs/common';
import { Debate } from '@prisma/client';
import {
  AttackVerification,
  StopConditionResult,
  ThesisImprovement,
} from '../types/ai-agent.type';

@Injectable()
export class StopConditionService {
  evaluate(
    debate: Debate,
    improvement: ThesisImprovement,
    verifications: AttackVerification[],
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

    return {
      shouldStop: false,
      reason: 'CONTINUE',
    };
  }
}

