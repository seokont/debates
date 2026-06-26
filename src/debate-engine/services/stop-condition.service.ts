import { Injectable } from '@nestjs/common';
import { Debate, DebateMode } from '@prisma/client';
import {
  AttackVerification,
  StopConditionResult,
  ThesisImprovement,
} from '../types/ai-agent.type';

const NO_IMPROVEMENT_THRESHOLD = 3;
const DIVERGENT_STAGNATION_THRESHOLD = 3;
// Minimum rounds before any early stop is allowed (except MAX_ROUNDS_REACHED)
const MIN_ROUNDS_BEFORE_STOP = 5;

@Injectable()
export class StopConditionService {
  evaluate(
    debate: Debate,
    improvement: ThesisImprovement,
    verifications: AttackVerification[],
    recentScores: (number | null)[] = [],
  ): StopConditionResult {
    if (improvement.roundNumber >= debate.maxRounds) {
      return { shouldStop: true, reason: 'MAX_ROUNDS_REACHED' };
    }

    // Enforce minimum rounds — debates should have substance before stopping early
    const minRounds = Math.min(MIN_ROUNDS_BEFORE_STOP, debate.maxRounds);
    if (improvement.roundNumber < minRounds) {
      return { shouldStop: false, reason: 'CONTINUE' };
    }

    if (!improvement.changed) {
      return { shouldStop: true, reason: 'THESIS_DID_NOT_CHANGE' };
    }

    if (verifications.length === 0) {
      return { shouldStop: true, reason: 'NO_ATTACKS_GENERATED' };
    }

    if (debate.mode === DebateMode.DIVERGENT) {
      return this.evaluateDivergent(verifications, recentScores);
    }

    // CONVERGENT and GEOPOLITICAL: only allow closure after minimum rounds
    const allAttacksClosed = verifications.every((v) => v.status === 'closed');

    if (allAttacksClosed) {
      return { shouldStop: true, reason: 'ALL_ATTACKS_CLOSED' };
    }

    if (this.noImprovementForNRounds(recentScores, NO_IMPROVEMENT_THRESHOLD)) {
      return {
        shouldStop: true,
        reason: `NO_IMPROVEMENT_FOR_${NO_IMPROVEMENT_THRESHOLD}_ROUNDS`,
      };
    }

    return { shouldStop: false, reason: 'CONTINUE' };
  }

  // In DIVERGENT mode, attacks staying open = success (contradictions mapped).
  // Stop when the contradiction map stabilises: scores consistently low for N rounds.
  private evaluateDivergent(
    verifications: AttackVerification[],
    recentScores: (number | null)[],
  ): StopConditionResult {
    const allOpen = verifications.every((v) => v.status !== 'closed');

    if (
      allOpen &&
      this.noImprovementForNRounds(recentScores, DIVERGENT_STAGNATION_THRESHOLD)
    ) {
      return { shouldStop: true, reason: 'CONTRADICTION_MAP_COMPLETE' };
    }

    if (this.noImprovementForNRounds(recentScores, NO_IMPROVEMENT_THRESHOLD)) {
      return { shouldStop: true, reason: 'CONTRADICTION_MAP_COMPLETE' };
    }

    return { shouldStop: false, reason: 'CONTINUE' };
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
