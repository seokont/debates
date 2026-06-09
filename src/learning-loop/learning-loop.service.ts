import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentService } from '../debate-engine/services/agent.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LearningLoopService {
  private readonly logger = new Logger(LearningLoopService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async runWeeklyCycle(): Promise<{ patternsExtracted: number }> {
    const weekTag = this.getWeekTag();

    const existing = await this.prisma.promptPattern.findFirst({ where: { weekTag } });
    if (existing) {
      this.logger.log(`Learning loop already ran for week ${weekTag}`);
      return { patternsExtracted: 0 };
    }

    const completedDebates = await this.prisma.debate.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      include: {
        rounds: {
          select: {
            inputThesis: true,
            outputThesis: true,
            closedAttacks: true,
            openWeaknesses: true,
            improvementScore: true,
          },
        },
      },
      take: 50,
    });

    if (completedDebates.length < 5) {
      this.logger.log('Not enough completed debates for learning loop this week');
      return { patternsExtracted: 0 };
    }

    const roundsWithHighScore = completedDebates.flatMap((d) =>
      d.rounds.filter((r) => (r.improvementScore ?? 0) > 0.7),
    );

    if (roundsWithHighScore.length === 0) return { patternsExtracted: 0 };

    const prompt = [
      'Analyze these high-scoring debate rounds and extract reusable attack patterns.',
      '',
      'ROUNDS WITH HIGH IMPROVEMENT SCORES:',
      ...roundsWithHighScore.slice(0, 20).map(
        (r, i) =>
          `Round ${i + 1}:\nInput: ${r.inputThesis?.slice(0, 200)}\nOutput: ${r.outputThesis?.slice(0, 200)}\nScore: ${r.improvementScore}`,
      ),
      '',
      'Extract 3-5 general attack patterns that worked well. For each:',
      'ROLE: [SKEPTIC/SYSTEMS_THINKER/PRACTICIAN/OPPONENT]',
      'PATTERN: [the attack pattern in 1-2 sentences]',
      'EXAMPLE: [how it appeared in the data above]',
      'EFFECTIVENESS: [0-100]',
    ].join('\n');

    try {
      const response = await this.agentService.callProvider('anthropic', prompt);
      const patterns = this.parsePatterns(response);

      for (const pattern of patterns) {
        const id = `${weekTag}:${pattern.role}:${pattern.pattern.slice(0, 20)}`;
        await this.prisma.promptPattern.upsert({
          where: { id },
          create: {
            id,
            role: pattern.role,
            pattern: pattern.pattern,
            effectiveness: pattern.effectiveness,
            weekTag,
          },
          update: {
            frequency: { increment: 1 },
            effectiveness: pattern.effectiveness,
          },
        });
      }

      this.logger.log(`Learning loop: extracted ${patterns.length} patterns for ${weekTag}`);

      const topPattern = patterns
        .filter((p) => (p.effectiveness ?? 0) > 90)
        .sort((a, b) => (b.effectiveness ?? 0) - (a.effectiveness ?? 0))[0];

      if (topPattern) {
        this.eventEmitter.emit('learning.insight', {
          pattern: topPattern.pattern,
          role: topPattern.role,
          effectiveness: topPattern.effectiveness,
        });
      }

      return { patternsExtracted: patterns.length };
    } catch (error) {
      this.logger.error(
        `Learning loop failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { patternsExtracted: 0 };
    }
  }

  getTopPatterns(role?: string, limit = 10) {
    return this.prisma.promptPattern.findMany({
      where: role ? { role } : {},
      orderBy: [{ effectiveness: 'desc' }, { frequency: 'desc' }],
      take: limit,
    });
  }

  private getWeekTag(): string {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil(
      ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7,
    );
    return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  private parsePatterns(
    response: string,
  ): Array<{ role: string; pattern: string; effectiveness: number }> {
    const results: Array<{ role: string; pattern: string; effectiveness: number }> = [];
    const blocks = response.split(/ROLE:/i).slice(1);

    for (const block of blocks) {
      const roleMatch = block.match(/^[^\n]+/);
      const patternMatch = block.match(/PATTERN:\s*([^\n]+)/i);
      const effectivenessMatch = block.match(/EFFECTIVENESS:\s*(\d+)/i);

      if (roleMatch && patternMatch) {
        results.push({
          role: roleMatch[0].trim().toUpperCase(),
          pattern: patternMatch[1].trim(),
          effectiveness: effectivenessMatch ? parseInt(effectivenessMatch[1], 10) : 70,
        });
      }
    }

    return results;
  }
}
