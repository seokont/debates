import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AgentService } from '../debate-engine/services/agent.service';
import { PrismaService } from '../prisma/prisma.service';

export const PATENT_QUEUE = 'patent-detector';
export const DETECT_PATENTS_JOB = 'detect-patents';

@Injectable()
export class PatentDetectorService {
  private readonly logger = new Logger(PatentDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
    @InjectQueue(PATENT_QUEUE) private readonly patentQueue: Queue,
  ) {}

  @OnEvent('debate.completed')
  handleDebateCompleted(payload: { debateId: string; userId: string }): void {
    this.patentQueue
      .add(DETECT_PATENTS_JOB, payload, {
        jobId: `patent:${payload.debateId}`,
        attempts: 2,
        removeOnComplete: true,
        removeOnFail: 20,
      })
      .catch((err: Error) => this.logger.warn(`Failed to queue patent detection: ${err.message}`));
  }

  async detectForDebate(debateId: string, userId: string): Promise<void> {
    const debate = await this.prisma.debate.findUnique({
      where: { id: debateId },
      select: {
        id: true,
        userId: true,
        originalThesis: true,
        currentThesis: true,
        opportunityScore: true,
        childQuestions: true,
        researchGaps: true,
        crossDomainHypotheses: true,
      },
    });

    if (!debate || (debate.opportunityScore ?? 0) < 60) return;

    const existing = await this.prisma.patentAlert.count({ where: { debateId } });
    if (existing > 0) return;

    const prompt = [
      'Analyze this inquiry result for patent opportunities.',
      '',
      `ORIGINAL THESIS: ${debate.originalThesis}`,
      `FINAL THESIS: ${debate.currentThesis}`,
      `OPPORTUNITY SCORE: ${debate.opportunityScore}/100`,
      '',
      'RESEARCH GAPS (potential unmet needs):',
      ...debate.researchGaps.map((g) => `- ${g}`),
      '',
      'CROSS-DOMAIN HYPOTHESES:',
      ...debate.crossDomainHypotheses.map((h) => `- ${h}`),
      '',
      'Identify 1-3 potential patent opportunities. For each, output:',
      'PATENT_TYPE: [PROCESS/COMPOSITION/MACHINE/DESIGN]',
      'TITLE: [short patent title]',
      'DESCRIPTION: [2-3 sentence description of what would be patented]',
      'NOVELTY_SCORE: [0-100, how novel this likely is]',
      'PRIOR_ART_RISK: [0-100, likelihood of prior art existing, 100=certain prior art]',
      '',
      'Only output entries where NOVELTY_SCORE > 50 and PRIOR_ART_RISK < 70.',
      'If no opportunities exist, output: NO_PATENT_OPPORTUNITIES',
    ].join('\n');

    try {
      const response = await this.agentService.callProvider('anthropic', prompt, userId);

      if (/NO_PATENT_OPPORTUNITIES/i.test(response)) return;

      const alerts = this.parsePatentAlerts(response);

      for (const alert of alerts) {
        await this.prisma.patentAlert.create({
          data: {
            debateId,
            userId: debate.userId,
            type: alert.type,
            title: alert.title,
            description: alert.description,
            noveltyScore: alert.noveltyScore,
            priorArtRisk: alert.priorArtRisk,
          },
        });
      }

      this.logger.log(`Patent detector: found ${alerts.length} opportunities for debate ${debateId}`);
    } catch (error) {
      this.logger.warn(
        `Patent detection failed for ${debateId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  getAlertsForDebate(debateId: string) {
    return this.prisma.patentAlert.findMany({
      where: { debateId },
      orderBy: { noveltyScore: 'desc' },
    });
  }

  getAlertsForUser(userId: string) {
    return this.prisma.patentAlert.findMany({
      where: { userId, status: 'NEW' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { debate: { select: { title: true, slug: true } } },
    });
  }

  private parsePatentAlerts(response: string): Array<{
    type: 'PROCESS' | 'COMPOSITION' | 'MACHINE' | 'DESIGN';
    title: string;
    description: string;
    noveltyScore: number;
    priorArtRisk: number;
  }> {
    const results: Array<{
      type: 'PROCESS' | 'COMPOSITION' | 'MACHINE' | 'DESIGN';
      title: string;
      description: string;
      noveltyScore: number;
      priorArtRisk: number;
    }> = [];

    const blocks = response.split(/PATENT_TYPE:/i).slice(1);

    for (const block of blocks) {
      const typeMatch = block.match(/^[^\n]+/);
      const titleMatch = block.match(/TITLE:\s*([^\n]+)/i);
      const descMatch = block.match(/DESCRIPTION:\s*([^\n]+)/i);
      const noveltyMatch = block.match(/NOVELTY_SCORE:\s*(\d+)/i);
      const priorArtMatch = block.match(/PRIOR_ART_RISK:\s*(\d+)/i);

      if (typeMatch && titleMatch && descMatch) {
        const rawType = typeMatch[0].trim().toUpperCase();
        const type = (['PROCESS', 'COMPOSITION', 'MACHINE', 'DESIGN'] as const).includes(rawType as any)
          ? (rawType as 'PROCESS' | 'COMPOSITION' | 'MACHINE' | 'DESIGN')
          : 'PROCESS';

        results.push({
          type,
          title: titleMatch[1].trim(),
          description: descMatch[1].trim(),
          noveltyScore: noveltyMatch ? parseInt(noveltyMatch[1], 10) : 60,
          priorArtRisk: priorArtMatch ? parseInt(priorArtMatch[1], 10) : 50,
        });
      }
    }

    return results;
  }
}
