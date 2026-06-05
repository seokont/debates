# Project Specification

Last updated: 2026-06-04

## Project Overview

This repository is a NestJS backend for a debate engine. A user submits a thesis,
the backend creates a debate, charges credits, queues background work, runs
several AI agents against the thesis, stores debate events, refines the thesis,
verifies whether attacks were addressed, and eventually saves a final result.

The main runtime components are:

- NestJS API application.
- PostgreSQL database accessed through Prisma.
- Redis-backed BullMQ queue for background debate execution.
- Prisma models for users, refresh tokens, debates, rounds, and events.
- Multi-provider AI agent layer for OpenAI, Anthropic Claude, Google Gemini, and xAI Grok.

## Important Modules

- `src/app.module.ts`: global app setup, config loading, BullMQ Redis connection.
- `src/auth`: JWT auth and current-user handling.
- `src/users`: user-related application logic.
- `src/debates`: public debate API, debate creation, restart, lookup, event stream, and queue integration.
- `src/debate-engine`: background debate orchestration and round execution.
- `src/prisma`: Prisma service/module.
- `prisma/schema.prisma`: database schema and enums.

## Debate API Flow

The main entry point is `POST /debates`.

Request DTO: `src/debates/dto/create-debate.dto.ts`

Expected body example:

```json
{
  "thesis": "AI will replace middle management",
  "models": ["GPT", "CLAUDE", "GEMINI", "GROK"],
  "mode": "CONVERGENT",
  "visibility": "PUBLIC",
  "maxRounds": 6,
  "quietMode": false
}
```

Processing flow:

1. `DebatesController.create()` receives the request.
2. `DebatesService.create()` charges the user by debate visibility.
3. A `Debate` row is created with `PENDING` status.
4. A `HUMAN` event with `metadata.action=CREATED` is stored.
5. A `RUN_DEBATE` BullMQ job is added to `debateQueue`.
6. `DebatesProcessor.process()` receives the job in a worker.
7. `DebateEngineService.startDebate()` starts the debate from the worker.
8. The engine marks the debate as `RUNNING`.
9. The engine runs rounds until a stop condition is met.
10. The engine stores final summaries and marks the debate as `COMPLETED`.

AI debate execution must not run inside the HTTP request/response path.
HTTP handlers may create database rows and enqueue jobs only.

BullMQ queues:

- `debateQueue`
- `notificationQueue`
- `billingQueue`

BullMQ jobs:

- `RUN_DEBATE`: starts full debate execution through `DebateEngineService.startDebate()`.
- `RUN_ROUND`: runs one debate round through `DebateEngineService.runNextRound()`.
- `GENERATE_FINAL_SUMMARY`: finalizes a debate through `DebateEngineService.completeDebate()`.
- `SEND_NOTIFICATION`: notification worker job.

## Live SSE

Frontend can watch a debate live through:

```http
GET /debates/:id/stream
```

For the backend-only MVP, this endpoint uses NestJS `EventEmitter2` plus SSE.
The stream first sends already persisted semantic events for the debate, then
pushes live events emitted after new `DebateEvent` rows are committed.

SSE event names:

- `debate.started`
- `round.started`
- `agent.attack.created`
- `thesis.improved`
- `attack.verified`
- `round.completed`
- `debate.completed`
- `debate.failed`

Example SSE event:

```text
event: agent.attack.created
data: {
  "debateId": "123",
  "roundNumber": 2,
  "agent": "CLAUDE",
  "role": "SYSTEMS_THINKER",
  "content": "Скрытый риск в том, что..."
}
```

## Debate Engine Flow

Main orchestrator: `src/debate-engine/debate-engine.service.ts`

Each round is handled by `src/debate-engine/services/round-runner.service.ts`.

One round does this:

1. Load the current debate.
2. Create a `DebateRound` row with `RUNNING` status and `inputThesis`.
3. Build the agent prompt with `PromptBuilderService`.
4. Run selected AI agents through `AgentService`.
5. Save agent outputs as round-linked `ATTACK` events.
6. Improve the thesis with `ThesisImproverService`.
7. Verify attacks with `VerificationService`.
8. Complete the `DebateRound` with `outputThesis`, `closedAttacks`, `openWeaknesses`, and `improvementScore`.
9. Save round-linked `IMPROVEMENT` and `VERIFICATION` events.
10. Evaluate continuation with `StopConditionService`.

Stop conditions:

- `MAX_ROUNDS_REACHED`: the current round reached `maxRounds`.
- `THESIS_DID_NOT_CHANGE`: the improver produced no change.
- `NO_ATTACKS_GENERATED`: no attacks were created.
- `ALL_ATTACKS_CLOSED`: all attacks are considered closed after the minimum closure round.

## Round Persistence

Each debate round is stored separately in `DebateRound`.

Important fields:

- `status`: `RUNNING`, `COMPLETED`, or `FAILED`.
- `inputThesis`: thesis snapshot at the start of the round.
- `outputThesis`: thesis produced by the improver after attacks.
- `closedAttacks`: JSON snapshot of attacks closed by verification.
- `openWeaknesses`: JSON snapshot of attacks that remain open.
- `improvementScore`: ratio of closed verifications to all verifications for the round.
- `startedAt` / `completedAt`: round lifecycle timestamps.

Round-specific `DebateEvent` rows store `roundId`.

## Event Log

All debate actions are stored as `DebateEvent` rows.

Event fields:

- `type`: one of `ATTACK`, `IMPROVEMENT`, `VERIFICATION`, `RESEARCH_GAP`, `HUMAN`, `SYSTEM`, or `FINAL`.
- `agent`: one of `GPT`, `CLAUDE`, `GEMINI`, `GROK`, or `SYSTEM`; empty for human-originated events.
- `role`: one of `SKEPTIC`, `SYSTEMS_THINKER`, `PRACTICIAN`, `OPPONENT`, `IMPROVER`, or `VERIFIER`.
- `content`: the primary human-readable event text.
- `metadata`: structured event details such as `attackId`, `roundNumber`, `closed`, `confidence`, or lifecycle `action`.

Lifecycle actions that are not first-class `DebateEventType` values are stored
as `SYSTEM`, `HUMAN`, or `FINAL` events with `metadata.action`, for example
`CREATED`, `QUEUED`, `STARTED`, `RESTARTED`, `ROUND_STARTED`,
`ROUND_COMPLETED`, `STOP_CONDITION_MET`, `ROUND_FAILED`, `FAILED`, and
`COMPLETED`.

Round-linked AI events use:

- `ATTACK`: `agent` is the model name, `role` is the attacking role, `content` is the attack.
- `IMPROVEMENT`: `agent=SYSTEM`, `role=IMPROVER`, `content` is the improved thesis.
- `VERIFICATION`: `agent=SYSTEM`, `role=VERIFIER`, `content` is the verification reason, and `metadata.targetRole` stores the attacked role.

## Human Injections

Users can intervene in a debate through human injections.

API:

- `POST /debates/:id/injections`
- `GET /debates/:id/injections`
- `POST /injections/:id/like`
- `POST /injections/:id/accept`

Create DTO:

```json
{
  "type": "ATTACK",
  "content": "Вы не учли, что в реальной компании менеджмент выполняет политическую функцию."
}
```

Injection types:

- `ATTACK`
- `CLARIFY`
- `ALTERNATIVE`
- `EXAMPLE`

Injection statuses:

- `PENDING`
- `ACCEPTED`
- `REJECTED`
- `USED_IN_ROUND`

MVP rule:

- Debate author injections are accepted immediately and written as `HUMAN` debate events with `metadata.action=HUMAN_INJECTION_ACCEPTED`.
- Other user injections are stored as `PENDING`.
- Admins can accept pending injections through `POST /injections/:id/accept`.
- Likes increment `likesCount`; future rules can accept injections by 5 likes or payment.

## Comments

Users can discuss a debate without changing debate memory.

API:

- `POST /debates/:id/comments`
- `GET /debates/:id/comments`
- `POST /comments/:id/like`
- `DELETE /comments/:id`

Create DTO:

```json
{
  "content": "Хороший аргумент, но в реальных компаниях это часто работает иначе.",
  "parentId": "optional-parent-comment-uuid"
}
```

Persistence:

- `Comment` stores `debateId`, `userId`, optional `parentId`, `content`, `likesCount`, and `createdAt`.
- `CommentLike` stores one like per `(commentId, userId)`.
- Repeated likes are idempotent and do not increment `likesCount` twice.
- Comment authors and admins can delete comments.

## Billing

Backend MVP uses simple credit accounting without subscriptions.

Credit costs:

- Public debate: 1 credit.
- Private debate: 5 credits.
- Instant human injection: 1 credit.

API:

- `GET /billing/balance`
- `GET /billing/transactions`
- `POST /billing/checkout`
- `POST /billing/webhook`

Persistence:

- `CreditTransaction` stores every balance movement.
- `type=CREDIT` increases `User.balanceCredits`.
- `type=DEBIT` decreases `User.balanceCredits`.
- `amount` is stored as a positive integer; direction is represented by `type`.
- `reason` stores the application reason, for example `DEBATE`,
  `PRIVATE_DEBATE`, `INSTANT_INJECTION`, `CHECKOUT`, `STRIPE_WEBHOOK`, or
  `QUEUE_UNAVAILABLE_REFUND`.
- `stripePaymentId` can be attached to checkout/webhook credits.

Runtime rules:

- Credit debit and domain writes happen in the same Prisma transaction.
- If the debate queue is unavailable after debate creation/restart, the debate
  is marked `FAILED` and the charged amount is refunded with a credit
  transaction.
- `POST /billing/checkout` is an MVP endpoint that credits the authenticated
  user immediately.
- `POST /billing/webhook` is an MVP webhook endpoint that credits the provided
  user id; production must add Stripe signature verification before exposure.

## User API Keys

Users can connect their own AI provider keys.

API:

- `GET /settings/api-keys`
- `POST /settings/api-keys`
- `DELETE /settings/api-keys/:id`

Create DTO:

```json
{
  "provider": "OPENAI",
  "key": "sk-proj-..."
}
```

Supported providers:

- `OPENAI`
- `ANTHROPIC`
- `GOOGLE`
- `XAI`

Security rules:

- Raw keys are accepted only in `POST /settings/api-keys`.
- Raw keys are encrypted before storage in `UserApiKey.encryptedKey`.
- API responses never return the raw key or `encryptedKey`.
- API responses return only `maskedValue`, for example `sk-proj-****abc`.
- `DELETE /settings/api-keys/:id` deactivates the key by setting `isActive=false`.
- Encryption uses `USER_API_KEY_ENCRYPTION_SECRET`, falling back to `JWT_ACCESS_SECRET` in development.
- During AI provider calls, an active user-owned key for the debate owner takes priority over the environment API key.

## Anchor Prompt

Anchor Prompt is the debate memory passed to every AI agent on every round.
`RoundRunnerService` loads the current debate and prior debate events, then
`PromptBuilderService.buildAnchorPrompt()` builds an agent-specific prompt using
the agent role from `AgentService`.

Required prompt shape:

```text
ИСХОДНЫЙ ТЕЗИС:
{originalThesis}

ТЕКУЩАЯ ВЕРСИЯ:
{currentThesis}

ЗАКРЫТЫЕ АТАКИ:
{closedAttacks}

ОТКРЫТЫЕ СЛАБОСТИ:
{openWeaknesses}

ПОСЛЕДНИЕ РАУНДЫ:
{lastEvents}

ТВОЯ РОЛЬ:
{agentRole}

ЗАДАЧА:
Найди одну новую конкретную дыру.
Не повторяй закрытые атаки.
Не делай общую философию.
Ответ должен быть конкретным.
```

Memory fields are derived from persisted `DebateEvent` rows:

- `closedAttacks`: prior `ATTACK` events whose latest `VERIFICATION` event has `metadata.closed=true`.
- `openWeaknesses`: prior `ATTACK` events without a closing verification.
- `lastEvents`: recent `ATTACK`, `IMPROVEMENT`, and `VERIFICATION` events.
- `agentRole`: the role assigned to the concrete agent for the current provider/model call.

## AI Provider Integration

Main file: `src/debate-engine/services/agent.service.ts`

The provider mapping currently is:

| Debate model enum | Provider | Role | API |
| --- | --- | --- | --- |
| `GPT` | OpenAI | `SKEPTIC` | `POST https://api.openai.com/v1/responses` |
| `CLAUDE` | Anthropic | `SYSTEMS_THINKER` | `POST https://api.anthropic.com/v1/messages` |
| `GEMINI` | Google | `PRACTICIAN` | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` |
| `GROK` | xAI | `OPPONENT` | `POST https://api.x.ai/v1/responses` |

Agent roles:

- `SKEPTIC`: finds a weak causal link or unsupported premise.
- `SYSTEMS_THINKER`: finds delayed second- or third-order system risks.
- `PRACTICIAN`: checks practical constraints, incentives, adoption, and execution.
- `OPPONENT`: proposes a credible alternative system.

If no models are provided internally, `AgentService.getAgents()` defaults to all
four debate models: `GPT`, `CLAUDE`, `GEMINI`, and `GROK`.

## Environment Variables

The real values belong in `.env`. The public template is `.env.example`.

Required for core backend:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ppp?schema=public"
JWT_ACCESS_SECRET="change-me-access-secret"
JWT_REFRESH_SECRET="change-me-refresh-secret"
REDIS_URL="redis://localhost:6379"
PORT=3000
```

Required for real AI provider calls:

```env
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-4o-mini"

ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL="claude-sonnet-4-5"
ANTHROPIC_VERSION="2023-06-01"

GEMINI_API_KEY=""
GEMINI_MODEL="gemini-3.5-flash"

XAI_API_KEY=""
XAI_MODEL="grok-4.3"

DEBATE_AGENT_MAX_OUTPUT_TOKENS=450
DEBATE_AGENT_FALLBACK_ON_ERROR=false
```

`DEBATE_AGENT_FALLBACK_ON_ERROR=false` is recommended during development because
provider errors will fail loudly instead of being hidden by local fallback text.

## What Has Already Been Implemented

Implemented backend foundation:

- NestJS backend structure.
- Global config loading through `ConfigModule`.
- Prisma/PostgreSQL integration.
- Redis/BullMQ queue integration.
- User auth modules and JWT-protected debate creation.
- Debate create/list/get/final/restart/SSE endpoints.
- Prisma schema for users, refresh tokens, debates, rounds, and events.
- Docker deployment guide in `DOCKER.md`.

Implemented debate engine:

- `DebateEngineService` orchestration loop.
- Debate state transitions: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- Round execution service.
- Prompt builder for multi-agent attack prompts.
- Event persistence through `DebateEventType`, `AiAgentName`, `AiAgentRole`, `content`, and `metadata`.
- Stop condition logic.
- Final summary generation.

Implemented AI work:

- Real provider routing by `DebateAiModel`.
- OpenAI Responses API integration.
- Anthropic Messages API integration.
- Google Gemini `generateContent` integration.
- xAI Responses API integration.
- Provider-specific response parsing.
- Shared max output token config.
- Local fallback attack generation when fallback mode is enabled.

## Current Limitations

- AI currently generates only attacks.
- `ThesisImproverService` is still rule-based and does not call an AI model.
- `VerificationService` is still heuristic and checks for role-specific keywords.
- All provider calls are non-streaming.
- Provider-specific rate limits, retries, and timeout handling are not yet centralized.
- There are no dedicated tests for provider response parsing yet.
- Real provider calls require valid external API keys and network access.

## Recommended Next Development Steps

1. Make `ThesisImproverService` AI-based so it rewrites the thesis using the attacks.
2. Make `VerificationService` AI-based or hybrid, with structured JSON output.
3. Add unit tests for provider response extractors and fallback behavior.
4. Add retry/timeout handling around provider calls.
5. Store provider latency and `usedFallback` in debate events if needed for observability.
6. Consider separate per-provider max tokens and model config.
7. Add integration tests for the full debate queue flow.
8. Update `DOCKER.md` production env section to include AI keys when deploying real AI debates.

## Verification

The last verified build command was:

```bash
C:\nvm4w\nodejs\npm.cmd run build
```

Result: build passed.

`npm run lint` was not completed in the sandbox because direct access to the
local Node/NPM installation path was denied.
