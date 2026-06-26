import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BuildStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CascadeAgentService } from './services/cascade-agent.service';
import { DeployService } from './services/deploy.service';
import { BUILD_QUEUE, BuildRoomService, RUN_BUILD_JOB } from './build-room.service';

type BuildJobData = { projectId: string; userId: string };

@Processor(BUILD_QUEUE)
export class BuildRoomProcessor extends WorkerHost {
  private readonly logger = new Logger(BuildRoomProcessor.name);

  constructor(
    private readonly buildRoomService: BuildRoomService,
    private readonly cascadeAgent: CascadeAgentService,
    private readonly deployService: DeployService,
    private readonly eventEmitter: EventEmitter2,
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
        content: 'Build started — 8-agent cascade: Product → Tech → Design → Growth → Marketing → Economics → Psychology → Legal',
      });

      const result = await this.cascadeAgent.buildMvp(thesis, project.title, job.data.userId);

      for (const step of result.steps) {
        await this.buildRoomService.addEvent(projectId, {
          type: step.type,
          agent: step.agent,
          content: step.content,
          metadata: step.metadata as any,
        });
      }

      if (result.passed) {
        const deployResult = await this.deployService.deploy({
          slug: project.slug,
          title: project.title,
          thesis,
          mvpScope: result.mvpScope,
          stack: result.stack,
          techCode: result.steps.find((s) => s.type === 'CODE')?.content ?? '',
        });

        await this.buildRoomService.updateStatus(
          projectId,
          deployResult.deployUrl ? BuildStatus.DEPLOYED : BuildStatus.REVIEW,
          deployResult.deployUrl ? { deployUrl: deployResult.deployUrl } : undefined,
        );
      } else {
        await this.buildRoomService.updateStatus(projectId, BuildStatus.FAILED);
      }

      this.eventEmitter.emit('build.completed', {
        projectId,
        userId: job.data.userId,
        passed: result.passed,
      });

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
