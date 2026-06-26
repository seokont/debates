-- Add GLM (Zhipu AI) and Kimi (Moonshot AI) providers

ALTER TYPE "AiProvider" ADD VALUE 'ZHIPU';
ALTER TYPE "AiProvider" ADD VALUE 'MOONSHOT';

ALTER TYPE "DebateAiModel" ADD VALUE 'GLM';
ALTER TYPE "DebateAiModel" ADD VALUE 'KIMI';

ALTER TYPE "AiAgentName" ADD VALUE 'GLM';
ALTER TYPE "AiAgentName" ADD VALUE 'KIMI';
