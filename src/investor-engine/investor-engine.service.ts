import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AgentService } from '../debate-engine/services/agent.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutreachService } from './outreach.service';

@Injectable()
export class InvestorEngineService {
  private readonly logger = new Logger(InvestorEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
    private readonly outreachService: OutreachService,
  ) {}

  async findInvestors(projectId: string, userId: string) {
    const project = await this.prisma.buildProject.findFirst({
      where: { id: projectId },
      include: {
        debate: { select: { currentThesis: true, researchGaps: true } },
      },
    });

    if (!project) throw new NotFoundException('Build project not found');

    const internalMatches = await this.findInternalMatches(
      project.debate.currentThesis,
    );
    const aiMatches = await this.findAiMatches(project.title, project.debate.currentThesis, userId);

    const allMatches = [...internalMatches, ...aiMatches]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const saved = await Promise.all(
      allMatches.map(async (m) => {
        const investor = await this.prisma.investorProfile.upsert({
          where: { id: m.investorId ?? 'new-' + Math.random().toString(36).slice(2) },
          create: {
            name: m.name,
            email: m.email,
            domains: m.domains,
            description: m.description,
            source: m.source,
          },
          update: {},
        });

        return this.prisma.investorMatch.create({
          data: {
            projectId,
            investorId: investor.id,
            userId,
            matchScore: m.score,
            matchReason: m.reason,
          },
        });
      }),
    );

    return saved;
  }

  listMatches(projectId: string) {
    return this.prisma.investorMatch.findMany({
      where: { projectId },
      orderBy: { matchScore: 'desc' },
      include: { investor: true },
    });
  }

  async sendOutreach(matchId: string, baseUrl: string) {
    const match = await this.prisma.investorMatch.findUnique({
      where: { id: matchId },
      include: {
        investor: true,
        project: { select: { id: true, title: true, deployUrl: true, debateId: true } },
      },
    });

    if (!match) throw new NotFoundException('Investor match not found');
    if (!match.investor.email) {
      throw new NotFoundException('Investor has no email address');
    }

    const emailBody = `Investor: ${match.investor.name}\nProject: ${match.project.title}\nReason: ${match.matchReason}`;

    await this.outreachService.sendOutreachEmail({
      to: match.investor.email,
      investorName: match.investor.name,
      projectTitle: match.project.title,
      debateUrl: `${baseUrl}/debate/${match.project.debateId}`,
      mvpUrl: match.project.deployUrl ?? undefined,
      matchReason: match.matchReason,
    });

    await this.prisma.investorMatch.update({
      where: { id: matchId },
      data: {
        outreachStatus: 'SENT',
        emailSentAt: new Date(),
        emailBody,
      },
    });

    return { sent: true, to: match.investor.email };
  }

  private async findInternalMatches(
    thesis: string,
  ): Promise<Array<{
    investorId: string;
    name: string;
    email?: string;
    domains: string[];
    description: string;
    source: string;
    score: number;
    reason: string;
  }>> {
    const domains = this.extractDomains(thesis);
    if (domains.length === 0) return [];

    const investors = await this.prisma.investorProfile.findMany({
      where: { domains: { hasSome: domains } },
      take: 5,
    });

    return investors.map((inv) => ({
      investorId: inv.id,
      name: inv.name,
      email: inv.email ?? undefined,
      domains: inv.domains,
      description: inv.description ?? '',
      source: inv.source,
      score: 70 + Math.random() * 20,
      reason: `Matches domain interests: ${inv.domains.filter((d) => domains.includes(d)).join(', ')}`,
    }));
  }

  private async findAiMatches(
    projectTitle: string,
    thesis: string,
    userId?: string,
  ): Promise<Array<{
    investorId?: string;
    name: string;
    email?: string;
    domains: string[];
    description: string;
    source: string;
    score: number;
    reason: string;
  }>> {
    const prompt = [
      `Suggest 5 types of investors who would be interested in this project.`,
      `Project: ${projectTitle}`,
      `Thesis: ${thesis}`,
      ``,
      `For each investor type, output:`,
      `INVESTOR: [descriptive name, e.g. "Longevity-focused biotech VC"]`,
      `DOMAINS: [comma-separated domains they invest in]`,
      `REASON: [1 sentence why they'd be interested]`,
      `SCORE: [60-95 match score]`,
    ].join('\n');

    try {
      const response = await this.agentService.callProvider('anthropic', prompt, userId);
      return this.parseAiInvestors(response);
    } catch {
      return [];
    }
  }

  private parseAiInvestors(response: string): Array<{
    name: string;
    domains: string[];
    description: string;
    source: string;
    score: number;
    reason: string;
  }> {
    const results: Array<{
      name: string;
      domains: string[];
      description: string;
      source: string;
      score: number;
      reason: string;
    }> = [];

    const blocks = response.split(/INVESTOR:/i).slice(1);
    for (const block of blocks) {
      const nameMatch = block.match(/^[^\n]+/);
      const domainsMatch = block.match(/DOMAINS:\s*([^\n]+)/i);
      const reasonMatch = block.match(/REASON:\s*([^\n]+)/i);
      const scoreMatch = block.match(/SCORE:\s*(\d+)/i);

      if (nameMatch && domainsMatch) {
        results.push({
          name: nameMatch[0].trim(),
          domains: domainsMatch[1].split(',').map((d) => d.trim()),
          description: reasonMatch?.[1]?.trim() ?? '',
          source: 'AI_GENERATED',
          score: scoreMatch ? parseInt(scoreMatch[1], 10) : 70,
          reason: reasonMatch?.[1]?.trim() ?? 'AI-suggested match',
        });
      }
    }

    return results;
  }

  private extractDomains(thesis: string): string[] {
    const domainKeywords: Record<string, string[]> = {
      longevity: ['longevity', 'aging', 'lifespan', 'healthspan'],
      cancer: ['cancer', 'oncology', 'tumor', 'immunotherapy'],
      ai: ['artificial intelligence', 'machine learning', 'llm', 'deep learning'],
      biotech: ['biotech', 'biology', 'drug', 'pharmaceutical'],
      climate: ['climate', 'carbon', 'energy', 'renewable'],
      fintech: ['finance', 'banking', 'payment', 'crypto'],
    };

    const normalized = thesis.toLowerCase();
    return Object.entries(domainKeywords)
      .filter(([, keywords]) => keywords.some((kw) => normalized.includes(kw)))
      .map(([domain]) => domain);
  }
}
