import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BuildStatus } from '@prisma/client';
import { CascadeAgentService } from './services/cascade-agent.service';
import { BUILD_QUEUE, BuildRoomService, RUN_BUILD_JOB } from './build-room.service';

type BuildJobData = { projectId: string; userId: string };

@Processor(BUILD_QUEUE)
export class BuildRoomProcessor extends WorkerHost {
  private readonly logger = new Logger(BuildRoomProcessor.name);

  constructor(
    private readonly buildRoomService: BuildRoomService,
    private readonly cascadeAgent: CascadeAgentService,
  ) {
    super();
  }

  async process(job: Job<BuildJobData>) {
    if (job.name !== RUN_BUILD_JOB) return;

    const { projectId } = job.data;
    await this.buildRoomService.updateStatus(projectId, BuildStatus.BUILDING);

    try {
      const project = await this.buildRoomService.findOne(projectId);
      const thesis = project.debate.currentThesis;

      await this.buildRoomService.addEvent(projectId, {
        type: 'SYSTEM',
        agent: 'SYSTEM',
        content: 'Build started — cascade pipeline: DeepSeek → Kimi → Claude',
      });

      const result = await this.cascadeAgent.buildMvp(thesis, project.title);

      await this.buildRoomService.addEvent(projectId, {
        type: 'ARCHITECTURE',
        agent: 'GPT',
        content: result.architecture,
        metadata: { stack: result.stack },
      });

      await this.buildRoomService.addEvent(projectId, {
        type: 'CODE',
        agent: 'DEEPSEEK',
        content: result.code,
      });

      await this.buildRoomService.addEvent(projectId, {
        type: 'REVIEW',
        agent: 'KIMI',
        content: result.review,
      });

      await this.buildRoomService.addEvent(projectId, {
        type: result.passed ? 'AUDIT_PASSED' : 'SYSTEM',
        agent: 'CLAUDE',
        content: result.audit,
        metadata: { passed: result.passed },
      });

      await this.buildRoomService.updateStatus(
        projectId,
        result.passed ? BuildStatus.REVIEW : BuildStatus.FAILED,
      );

      this.logger.log(`Build complete for project ${projectId}: passed=${result.passed}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown build error';
      this.logger.error(`Build failed for project ${projectId}: ${msg}`);

      await this.buildRoomService.addEvent(projectId, {
        type: 'SYSTEM',
        agent: 'SYSTEM',
        content: msg,
        metadata: { action: 'FAILED' },
      });
      await this.buildRoomService.updateStatus(projectId, BuildStatus.FAILED);
    }
  }
}
