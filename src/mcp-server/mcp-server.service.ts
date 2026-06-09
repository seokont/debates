import { Injectable, NotFoundException } from '@nestjs/common';
import { ExploreType, SessionMode } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ExploreService } from '../explore/explore.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  McpResource,
  McpResourceContent,
  McpServerInfo,
  McpTool,
  McpToolResult,
} from './types/mcp.types';

const SERVER_VERSION = '1.0.0';

const MCP_TOOLS: McpTool[] = [
  {
    name: 'explore_idea',
    description: 'Launch a Mind Arena Explore session to investigate a question or idea space using parallel AI paths',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question or domain to explore (3-500 chars)' },
        userId: { type: 'string', description: 'User UUID to run the session as' },
        exploreType: { type: 'string', description: 'One of: STARTUPS, SCIENCE, SOLUTIONS, ANOMALY' },
      },
      required: ['question', 'userId'],
    },
  },
  {
    name: 'get_debate_insights',
    description: 'Get cross-domain insights and profit patterns for a completed debate',
    inputSchema: {
      type: 'object',
      properties: {
        debateId: { type: 'string', description: 'Debate UUID' },
      },
      required: ['debateId'],
    },
  },
  {
    name: 'get_top_patterns',
    description: 'Get the most effective prompt patterns discovered by the weekly Learning Loop',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Max patterns to return (default: 5)' },
      },
      required: [],
    },
  },
];

@Injectable()
export class McpServerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exploreService: ExploreService,
  ) {}

  getServerInfo(): McpServerInfo {
    return {
      name: 'mind-arena',
      version: SERVER_VERSION,
      description: 'Mind Arena MCP Server — access debates, Explore sessions, and AI insights',
      capabilities: { resources: true, tools: true, prompts: false },
    };
  }

  async listResources(): Promise<McpResource[]> {
    const debates = await this.prisma.debate.findMany({
      where: { visibility: 'PUBLIC', status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: 20,
      select: { id: true, title: true, opportunityScore: true },
    });

    const resources: McpResource[] = debates.map((d) => ({
      uri: `mind-arena://debates/${d.id}`,
      name: d.title ?? `Debate ${d.id.slice(0, 8)}`,
      description: `Completed debate with Opportunity Score ${d.opportunityScore ?? 'N/A'}`,
      mimeType: 'application/json',
    }));

    const sessions = await this.prisma.exploreSession.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: 10,
      select: { id: true, question: true, exploreType: true },
    });

    for (const s of sessions) {
      resources.push({
        uri: `mind-arena://sessions/${s.id}`,
        name: s.question.slice(0, 64),
        description: `Explore session of type ${s.exploreType}`,
        mimeType: 'application/json',
      });
    }

    return resources;
  }

  async readResource(uri: string): Promise<McpResourceContent> {
    const debateMatch = uri.match(/^mind-arena:\/\/debates\/([0-9a-f-]+)$/i);
    if (debateMatch) {
      const debate = await this.prisma.debate.findFirst({
        where: { id: debateMatch[1], visibility: 'PUBLIC' },
        include: {
          rounds: {
            select: { roundNumber: true, outputThesis: true, improvementScore: true },
            orderBy: { roundNumber: 'asc' },
          },
          events: {
            where: { type: { in: ['RESEARCH_GAP', 'FINAL'] } },
            select: { type: true, content: true },
            orderBy: { createdAt: 'asc' },
            take: 10,
          },
        },
      });

      if (!debate) throw new NotFoundException(`Resource not found: ${uri}`);

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            id: debate.id,
            title: debate.title,
            originalThesis: debate.originalThesis,
            finalThesis: debate.currentThesis,
            opportunityScore: debate.opportunityScore,
            researchGaps: debate.researchGaps,
            childQuestions: debate.childQuestions,
            rounds: debate.rounds,
            keyEvents: debate.events,
          },
          null,
          2,
        ),
      };
    }

    const sessionMatch = uri.match(/^mind-arena:\/\/sessions\/([0-9a-f-]+)$/i);
    if (sessionMatch) {
      const session = await this.prisma.exploreSession.findUnique({
        where: { id: sessionMatch[1] },
        include: {
          paths: {
            where: { status: 'WINNER' },
            orderBy: { score: 'desc' },
            take: 5,
            select: { hypothesis: true, category: true, score: true, openQuestions: true },
          },
        },
      });

      if (!session) throw new NotFoundException(`Resource not found: ${uri}`);

      return {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            id: session.id,
            question: session.question,
            exploreType: session.exploreType,
            winnerPaths: session.paths,
            generationsCount: session.generationsCount,
            totalPaths: session.totalPaths,
          },
          null,
          2,
        ),
      };
    }

    throw new NotFoundException(`Unknown resource URI: ${uri}`);
  }

  listTools(): McpTool[] {
    return MCP_TOOLS;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    callerUserId?: string,
  ): Promise<McpToolResult> {
    try {
      if (name === 'explore_idea') {
        const userId = (args['userId'] as string) ?? callerUserId;
        if (!userId) {
          return { content: [{ type: 'text', text: 'userId is required' }], isError: true };
        }

        const exploreTypeRaw = args['exploreType'] as string | undefined;
        const exploreType = (['STARTUPS', 'SCIENCE', 'SOLUTIONS', 'ANOMALY'] as const).includes(
          exploreTypeRaw as ExploreType,
        )
          ? (exploreTypeRaw as ExploreType)
          : ExploreType.STARTUPS;

        const result = await this.exploreService.create(
          { id: userId } as AuthenticatedUser,
          {
            question: args['question'] as string,
            mode: SessionMode.EXPLORE,
            exploreType,
            budgetLimit: 7,
          },
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                sessionId: result.sessionId,
                mode: result.mode,
                exploreType: result.exploreType,
              }),
            },
          ],
        };
      }

      if (name === 'get_debate_insights') {
        const debateId = args['debateId'] as string;
        const insights = await this.prisma.exploreInsight.findMany({
          where: { debateId },
          orderBy: { createdAt: 'asc' },
          take: 20,
          select: { type: true, content: true, createdAt: true },
        });

        return { content: [{ type: 'text', text: JSON.stringify(insights, null, 2) }] };
      }

      if (name === 'get_top_patterns') {
        const limit = parseInt((args['limit'] as string) ?? '5', 10) || 5;
        const patterns = await this.prisma.promptPattern.findMany({
          orderBy: [{ effectiveness: 'desc' }, { frequency: 'desc' }],
          take: Math.min(limit, 20),
          select: { role: true, pattern: true, effectiveness: true, frequency: true },
        });

        return { content: [{ type: 'text', text: JSON.stringify(patterns, null, 2) }] };
      }

      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    } catch (error) {
      return {
        content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool call failed' }],
        isError: true,
      };
    }
  }
}
