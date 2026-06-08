import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DebateAiModel, DebateMode, Visibility } from '@prisma/client';
import { AgentService } from '../debate-engine/services/agent.service';
import { DebatesService } from '../debates/debates.service';
import { PrismaService } from '../prisma/prisma.service';
import { fetchArxivLatest, NewsItem } from './news-sources/arxiv.source';
import { fetchHackerNewsTop } from './news-sources/hackernews.source';

@Injectable()
export class NewsMonitorService {
  private readonly logger = new Logger(NewsMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly agentService: AgentService,
    private readonly debatesService: DebatesService,
  ) {}

  async runMonitoringCycle(): Promise<{ created: number; skipped: number }> {
    const systemUserId = await this.getSystemUserId();
    if (!systemUserId) {
      this.logger.warn('No admin user found for SYSTEM_USER_ID — skipping news monitoring');
      return { created: 0, skipped: 0 };
    }

    const queriesRaw = this.config.get<string>('NEWS_MONITOR_QUERIES')
      ?? 'AI safety,longevity research,cancer immunotherapy';
    const queries = queriesRaw.split(',');
    const items: NewsItem[] = [];

    for (const query of queries) {
      try {
        const results = await fetchArxivLatest(query.trim(), 3);
        items.push(...results);
      } catch (error) {
        this.logger.warn(
          `arXiv fetch failed for "${query}": ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    try {
      const hnItems = await fetchHackerNewsTop(3);
      items.push(...hnItems);
    } catch (error) {
      this.logger.warn(
        `HackerNews fetch failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    let created = 0;
    let skipped = 0;

    for (const item of items) {
      try {
        const alreadyExists = await this.prisma.debate.findFirst({
          where: { sourceUrl: item.url },
          select: { id: true },
        });

        if (alreadyExists) {
          skipped++;
          continue;
        }

        const thesis = await this.extractThesis(item);
        if (!thesis) {
          skipped++;
          continue;
        }

        await this.debatesService.create(
          {
            id: systemUserId,
            role: 'ADMIN',
            balanceCredits: 999999,
            freeDebatesLeft: 0,
          } as any,
          {
            thesis,
            mode: DebateMode.CONVERGENT,
            visibility: Visibility.PUBLIC,
            models: [DebateAiModel.GPT, DebateAiModel.CLAUDE, DebateAiModel.GEMINI, DebateAiModel.GROK],
            maxRounds: 4,
            quietMode: true,
            sourceUrl: item.url,
          },
        );

        created++;
        this.logger.log(`Auto-created debate for: ${item.title.slice(0, 60)}`);
      } catch (error) {
        this.logger.warn(
          `Failed to create debate for "${item.title}": ${error instanceof Error ? error.message : 'unknown'}`,
        );
        skipped++;
      }
    }

    return { created, skipped };
  }

  private async extractThesis(item: NewsItem): Promise<string | null> {
    const prompt = [
      'Extract one debatable thesis from this article.',
      `Title: ${item.title}`,
      `Summary: ${item.summary}`,
      '',
      'Return ONLY the thesis (1-2 sentences). Must be specific, falsifiable, worth debating.',
      'If no good thesis can be extracted, return: SKIP',
    ].join('\n');

    try {
      const result = await this.agentService.callProvider('anthropic', prompt);
      const text = result.trim();
      if (!text || text === 'SKIP' || text.length < 15) return null;
      return text.slice(0, 400);
    } catch {
      return null;
    }
  }

  private async getSystemUserId(): Promise<string | null> {
    const configured = this.config.get<string>('SYSTEM_USER_ID');
    if (configured) return configured;

    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });

    return admin?.id ?? null;
  }
}
