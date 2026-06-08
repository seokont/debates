import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AgentService } from '../debate-engine/services/agent.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OpportunityReportService {
  private readonly logger = new Logger(OpportunityReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
  ) {}

  async generate(debateId: string, userId?: string) {
    const existing = await this.prisma.opportunityReport.findUnique({
      where: { debateId },
    });
    if (existing) return existing;

    const debate = await this.prisma.debate.findUnique({
      where: { id: debateId },
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
          select: {
            roundNumber: true,
            inputThesis: true,
            outputThesis: true,
            closedAttacks: true,
            openWeaknesses: true,
            improvementScore: true,
          },
        },
        events: {
          where: { type: { in: ['RESEARCH_GAP', 'FINAL'] } },
          orderBy: { createdAt: 'asc' },
          select: { type: true, content: true },
        },
      },
    });

    if (!debate) throw new NotFoundException('Debate not found');
    if (!debate.opportunityScore) throw new NotFoundException('Debate not yet completed');

    const prompt = [
      'Generate a structured Opportunity Report for this completed inquiry.',
      '',
      `TITLE: ${debate.title ?? debate.originalThesis}`,
      `ORIGINAL THESIS: ${debate.originalThesis}`,
      `FINAL THESIS: ${debate.currentThesis}`,
      `OPPORTUNITY SCORE: ${debate.opportunityScore}/100`,
      `ROUNDS: ${debate.roundCount}`,
      '',
      'ROUND PROGRESSION:',
      ...debate.rounds.map(
        (r) =>
          `Round ${r.roundNumber}: Score=${r.improvementScore?.toFixed(2) ?? 'N/A'} → "${r.outputThesis?.slice(0, 150) ?? ''}..."`,
      ),
      '',
      'RESEARCH GAPS:',
      ...debate.researchGaps.map((g) => `- ${g}`),
      '',
      'CHILD QUESTIONS:',
      ...debate.childQuestions.map((q) => `- ${q}`),
      '',
      'Write the following sections (use the exact headers):',
      'EXECUTIVE_SUMMARY: 3-4 sentences, what was found and why it matters',
      'METHODOLOGY: 2-3 sentences, how the inquiry was conducted',
      'KEY_FINDINGS: JSON array of objects [{finding, confidence, evidence}] (3-5 findings)',
      'INSIGHTS: JSON array of objects [{type, content}] where type is OPPORTUNITY/RISK/RESEARCH_GAP (3-5)',
    ].join('\n');

    try {
      const response = await this.agentService.callProvider('anthropic', prompt, userId);
      const parsed = this.parseReport(response);

      return this.prisma.opportunityReport.create({
        data: {
          debateId,
          title: debate.title ?? debate.originalThesis,
          executive: parsed.executive,
          methodology: parsed.methodology,
          findings: parsed.findings,
          insights: parsed.insights,
          gaps: debate.researchGaps,
          score: debate.opportunityScore,
        },
      });
    } catch (error) {
      this.logger.error(
        `Report generation failed for ${debateId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.prisma.opportunityReport.create({
        data: {
          debateId,
          title: debate.title ?? debate.originalThesis,
          executive: `Inquiry completed with Opportunity Score ${debate.opportunityScore}/100 across ${debate.roundCount} rounds.`,
          methodology: `Multi-model AI consilium with ${debate.roundCount} adversarial rounds and human verification.`,
          findings: debate.childQuestions.map((q) => ({ finding: q, confidence: 0.7, evidence: 'derived' })),
          insights: debate.researchGaps.map((g) => ({ type: 'RESEARCH_GAP', content: g })),
          gaps: debate.researchGaps,
          score: debate.opportunityScore,
        },
      });
    }
  }

  async findOne(debateId: string) {
    const report = await this.prisma.opportunityReport.findUnique({
      where: { debateId },
    });
    if (!report) throw new NotFoundException('Report not yet generated — call POST first');
    return report;
  }

  private parseReport(response: string): {
    executive: string;
    methodology: string;
    findings: Array<{ finding: string; confidence: number; evidence: string }>;
    insights: Array<{ type: string; content: string }>;
  } {
    const execMatch = response.match(/EXECUTIVE_SUMMARY:\s*([^\n]+(?:\n(?!METHODOLOGY:)[^\n]+)*)/i);
    const methMatch = response.match(/METHODOLOGY:\s*([^\n]+(?:\n(?!KEY_FINDINGS:)[^\n]+)*)/i);
    const findMatch = response.match(/KEY_FINDINGS:\s*(\[[\s\S]*?\])/i);
    const insiMatch = response.match(/INSIGHTS:\s*(\[[\s\S]*?\])/i);

    let findings: Array<{ finding: string; confidence: number; evidence: string }> = [];
    let insights: Array<{ type: string; content: string }> = [];

    try {
      if (findMatch) findings = JSON.parse(findMatch[1]);
    } catch { /* use empty */ }

    try {
      if (insiMatch) insights = JSON.parse(insiMatch[1]);
    } catch { /* use empty */ }

    return {
      executive: execMatch?.[1]?.trim() ?? 'Report generated.',
      methodology: methMatch?.[1]?.trim() ?? 'Multi-model AI consilium.',
      findings,
      insights,
    };
  }
}
