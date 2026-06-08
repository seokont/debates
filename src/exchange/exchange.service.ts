import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClaimStatus, TaskLevel, TaskStatus, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';

@Injectable()
export class ExchangeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreateTaskDto) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can create tasks directly');
    }

    return this.prisma.exchangeTask.create({
      data: {
        title: dto.title.trim(),
        description: dto.description.trim(),
        level: dto.level,
        rewardCredits: dto.rewardCredits,
        rewardPercent: dto.rewardPercent,
        projectId: dto.projectId,
        debateId: dto.debateId,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
    });
  }

  findAll(level?: TaskLevel) {
    return this.prisma.exchangeTask.findMany({
      where: {
        status: TaskStatus.OPEN,
        ...(level ? { level } : {}),
      },
      orderBy: [{ level: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        _count: { select: { claims: true } },
      },
    });
  }

  async findOne(id: string) {
    const task = await this.prisma.exchangeTask.findUnique({
      where: { id },
      include: {
        claims: {
          where: { status: ClaimStatus.ACTIVE },
          include: { user: { select: { id: true, username: true } } },
        },
      },
    });

    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async claim(id: string, user: AuthenticatedUser) {
    const task = await this.prisma.exchangeTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.status !== TaskStatus.OPEN) throw new ConflictException('Task is no longer open');

    const existingClaim = await this.prisma.taskClaim.findFirst({
      where: { taskId: id, userId: user.id, status: ClaimStatus.ACTIVE },
    });

    if (existingClaim) throw new ConflictException('You already claimed this task');

    const [, claim] = await this.prisma.$transaction([
      this.prisma.exchangeTask.update({
        where: { id },
        data: { status: TaskStatus.CLAIMED },
      }),
      this.prisma.taskClaim.create({
        data: { taskId: id, userId: user.id },
      }),
    ]);

    return claim;
  }

  async complete(taskId: string, user: AuthenticatedUser, dto: CompleteTaskDto) {
    const claim = await this.prisma.taskClaim.findFirst({
      where: { taskId, userId: user.id, status: ClaimStatus.ACTIVE },
    });

    if (!claim) throw new NotFoundException('No active claim for this task');

    const [updatedClaim] = await this.prisma.$transaction([
      this.prisma.taskClaim.update({
        where: { id: claim.id },
        data: {
          status: ClaimStatus.COMPLETED,
          completionNote: dto.note?.trim(),
          updatedAt: new Date(),
        },
      }),
      this.prisma.exchangeTask.update({
        where: { id: taskId },
        data: { status: TaskStatus.COMPLETED, updatedAt: new Date() },
      }),
    ]);

    return updatedClaim;
  }

  async cancel(taskId: string, user: AuthenticatedUser) {
    const claim = await this.prisma.taskClaim.findFirst({
      where: { taskId, userId: user.id, status: ClaimStatus.ACTIVE },
    });

    if (!claim) throw new NotFoundException('No active claim to cancel');

    await this.prisma.$transaction([
      this.prisma.taskClaim.update({
        where: { id: claim.id },
        data: { status: ClaimStatus.ABANDONED },
      }),
      this.prisma.exchangeTask.update({
        where: { id: taskId },
        data: { status: TaskStatus.OPEN },
      }),
    ]);

    return { cancelled: true };
  }
}
