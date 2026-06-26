import {
  AiAgentRole as PrismaAiAgentRole,
  DebateAiModel,
} from '@prisma/client';

export type AiProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'zhipu' | 'moonshot';

export type AiAgentRole = Extract<
  PrismaAiAgentRole,
  'SKEPTIC' | 'SYSTEMS_THINKER' | 'PRACTICIAN' | 'OPPONENT' | 'STRATEGIST' | 'SKEPTIC_INNOVATOR'
>;

export interface AiAgent {
  provider: AiProvider;
  role: AiAgentRole;
  model: DebateAiModel;
  run(prompt: string): Promise<AiAgentResponse>;
}

export interface AiAgentResponse {
  provider: AiProvider;
  role: AiAgentRole;
  model: DebateAiModel;
  content: string;
  latencyMs: number;
  usedFallback: boolean;
}

export interface DebateAttack {
  id: string;
  roundNumber: number;
  provider: AiProvider;
  role: AiAgentRole;
  model: DebateAiModel;
  content: string;
}

export interface ThesisImprovement {
  roundNumber: number;
  previousThesis: string;
  improvedThesis: string;
  summary: string;
  changed: boolean;
}

export type VerificationStatus = 'closed' | 'partially' | 'open';

export interface AttackVerification {
  attackId: string;
  roundNumber: number;
  provider: AiProvider;
  role: AiAgentRole;
  model: DebateAiModel;
  status: VerificationStatus;
  /** @deprecated use status instead — kept for backward compatibility */
  closed: boolean;
  reason: string;
  confidence: number;
}

export interface StopConditionResult {
  shouldStop: boolean;
  reason: string;
}
