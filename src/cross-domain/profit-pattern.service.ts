import { Injectable } from '@nestjs/common';
import { AgentService } from '../debate-engine/services/agent.service';
import { PrismaService } from '../prisma/prisma.service';

const PROFIT_PATTERNS = [
  { name: 'Picks & Shovels', description: 'Sell to everyone building the thing (infrastructure play)' },
  { name: 'Toll Road', description: 'Take a % of every transaction in a specific domain' },
  { name: 'Data Flywheel', description: 'More users → better data → better product → more users' },
  { name: 'Democratization', description: 'Make expensive thing cheap and accessible to masses' },
  { name: 'Compress Time', description: 'Get people the same result much faster' },
  { name: 'Aggregator', description: 'Aggregate fragmented supply or demand' },
  { name: 'Behavior Unlock', description: 'Enable behavior that was impossible without the technology' },
  { name: 'Bundling/Unbundling', description: 'Bundle disparate services or unbundle existing bundles' },
];

@Injectable()
export class ProfitPatternService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
  ) {}

  async analyzeForDebate(debateId: string, thesis: string, userId?: string): Promise<void> {
    const prompt = [
      'Analyze this thesis against 8 Profit Patterns. For each relevant pattern, give a 1-2 sentence application.',
      '',
      `THESIS: ${thesis}`,
      '',
      'PROFIT PATTERNS:',
      ...PROFIT_PATTERNS.map((p) => `${p.name}: ${p.description}`),
      '',
      'For each relevant pattern (skip irrelevant ones), output:',
      'PATTERN: [name]',
      'APPLICATION: [how this thesis relates to or could use this pattern]',
      'SCORE: [0-100 how strongly it applies]',
    ].join('\n');

    try {
      const response = await this.agentService.callProvider('anthropic', prompt, userId);
      const insights = this.parsePatterns(response);

      await this.prisma.$transaction(
        insights.map((insight) =>
          this.prisma.exploreInsight.create({
            data: {
              debateId,
              type: 'PROFIT_PATTERN',
              content: insight.application,
              metadata: { pattern: insight.pattern, score: insight.score },
            },
          }),
        ),
      );
    } catch {
      // non-critical enrichment
    }
  }

  async findCrossdomainAnalogies(
    debateId: string,
    thesis: string,
    researchGaps: string[],
    userId?: string,
  ): Promise<void> {
    if (researchGaps.length === 0) return;

    const prompt = [
      'Find cross-domain analogies for these unsolved research gaps.',
      `THESIS: ${thesis}`,
      '',
      'RESEARCH GAPS:',
      ...researchGaps.map((g, i) => `${i + 1}. ${g}`),
      '',
      'For each gap, find an analogous problem that was solved in a completely different domain.',
      'Output format:',
      'GAP: [gap text]',
      'ANALOGY: [domain: how they solved a similar problem]',
      'RELEVANCE: [why this analogy applies here]',
    ].join('\n');

    try {
      const response = await this.agentService.callProvider('anthropic', prompt, userId);
      const analogies = this.parseAnalogies(response);

      await this.prisma.$transaction(
        analogies.map((a) =>
          this.prisma.exploreInsight.create({
            data: {
              debateId,
              type: 'CROSS_DOMAIN',
              content: `${a.analogy}\n\nRelevance: ${a.relevance}`,
              metadata: { gap: a.gap },
            },
          }),
        ),
      );
    } catch {
      // non-critical enrichment
    }
  }

  private parsePatterns(
    response: string,
  ): Array<{ pattern: string; application: string; score: number }> {
    const results: Array<{ pattern: string; application: string; score: number }> = [];
    const blocks = response.split(/PATTERN:/i).slice(1);

    for (const block of blocks) {
      const patternMatch = block.match(/^[^\n]+/);
      const appMatch = block.match(/APPLICATION:\s*([^\n]+)/i);
      const scoreMatch = block.match(/SCORE:\s*(\d+)/i);

      if (patternMatch && appMatch) {
        results.push({
          pattern: patternMatch[0].trim(),
          application: appMatch[1].trim(),
          score: scoreMatch ? parseInt(scoreMatch[1], 10) : 50,
        });
      }
    }

    return results;
  }

  private parseAnalogies(
    response: string,
  ): Array<{ gap: string; analogy: string; relevance: string }> {
    const results: Array<{ gap: string; analogy: string; relevance: string }> = [];
    const blocks = response.split(/GAP:/i).slice(1);

    for (const block of blocks) {
      const gapMatch = block.match(/^[^\n]+/);
      const analogyMatch = block.match(/ANALOGY:\s*([^\n]+)/i);
      const relevanceMatch = block.match(/RELEVANCE:\s*([^\n]+)/i);

      if (gapMatch && analogyMatch && relevanceMatch) {
        results.push({
          gap: gapMatch[0].trim(),
          analogy: analogyMatch[1].trim(),
          relevance: relevanceMatch[1].trim(),
        });
      }
    }

    return results;
  }
}
