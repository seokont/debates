import {
  AttackVerification,
  DebateAttack,
  StopConditionResult,
  ThesisImprovement,
} from './ai-agent.type';

export interface RoundRunnerResult {
  roundId: string;
  roundNumber: number;
  attacks: DebateAttack[];
  improvement: ThesisImprovement;
  verifications: AttackVerification[];
  stopCondition: StopConditionResult;
}
