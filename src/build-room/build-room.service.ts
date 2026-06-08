import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { BuildStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBuildProjectDto } from './dto/create-build-project.dto';

export const BUILD_QUEUE = 'build-room';
export const RUN_BUILD_JOB = 'run-build';

@Injectable()
export class BuildRoomService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(BUILD_QUEUE) private readonly buildQueue: Queue,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateBuildProjectDto) {
    const debate = await this.prisma.debate.findFirst({
      where: { id: dto.debateId },
      select: {
        id: true,
        title: true,
        currentThesis: true,
        opportunityScore: true,
        status: true,
      },
    });

    if (!debate) throw new NotFoundException('Debate not found');
    if (debate.status !== 'COMPLETED') {
      throw new BadRequestException('Debate must be completed');
    }
    if ((debate.opportunityScore ?? 0) < 80) {
      throw new BadRequestException('Debate must have opportunityScore >= 80 to enter Build Room');
    }

    const slug = this.makeSlug(debate.title ?? debate.currentThesis);

    const project = await this.prisma.buildProject.create({
      data: {
        debateId: debate.id,
        userId: user.id,
        slug,
        title: (debate.title ?? debate.currentThesis).slice(0, 80),
        equityMap: {
          author: 20,
          experts: 15,
          builders: 30,
          platform: 25,
          reserve: 10,
        },
      },
    });

    await this.buildQueue.add(
      RUN_BUILD_JOB,
      { projectId: project.id, userId: user.id },
      {
        jobId: `build:${project.id}`,
        attempts: 2,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    return { projectId: project.id, slug: project.slug };
  }

  async findOne(id: string) {
    const project = await this.prisma.buildProject.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        tasks: { orderBy: { createdAt: 'asc' } },
        debate: {
          select: {
            id: true,
            title: true,
            originalThesis: true,
            currentThesis: true,
          },
        },
      },
    });

    if (!project) throw new NotFoundException('Build project not found');
    return project;
  }

  findAll() {
    return this.prisma.buildProject.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        deployUrl: true,
        stack: true,
        createdAt: true,
        debate: { select: { id: true, title: true } },
      },
    });
  }

  async addEvent(
    projectId: string,
    data: {
      type: string;
      agent?: string;
      content: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    return this.prisma.buildProjectEvent.create({
      data: {
        projectId,
        type: data.type as any,
        agent: data.agent,
        content: data.content,
        metadata: data.metadata,
      },
    });
  }

  async updateStatus(
    projectId: string,
    status: BuildStatus,
    extra?: { deployUrl?: string },
  ) {
    return this.prisma.buildProject.update({
      where: { id: projectId },
      data: {
        status,
        ...(status === BuildStatus.DEPLOYED ? { completedAt: new Date() } : {}),
        ...(extra?.deployUrl ? { deployUrl: extra.deployUrl } : {}),
      },
    });
  }

  private makeSlug(text: string): string {
    const base = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .slice(0, 40);

    return `${base || 'project'}-${randomUUID().slice(0, 6)}`;
  }
}
