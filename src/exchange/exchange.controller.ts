import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TaskLevel } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ExchangeService } from './exchange.service';

@ApiTags('Task Exchange')
@Controller('exchange')
export class ExchangeController {
  constructor(private readonly exchangeService: ExchangeService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Create a task manually' })
  @ApiCreatedResponse({ description: 'Task created' })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.exchangeService.create(user, dto);
  }

  @ApiOperation({ summary: 'List open tasks' })
  @ApiQuery({ name: 'level', enum: TaskLevel, required: false })
  @ApiOkResponse({ description: 'Open tasks' })
  @Get()
  findAll(@Query('level') level?: TaskLevel) {
    return this.exchangeService.findAll(level);
  }

  @ApiOperation({ summary: 'Get task details' })
  @ApiParam({ name: 'id' })
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.exchangeService.findOne(id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Claim a task' })
  @ApiParam({ name: 'id' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/claim')
  claim(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exchangeService.claim(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark your claimed task as complete' })
  @ApiParam({ name: 'id' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/complete')
  complete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CompleteTaskDto,
  ) {
    return this.exchangeService.complete(id, user, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Abandon your claimed task' })
  @ApiParam({ name: 'id' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  cancel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exchangeService.cancel(id, user);
  }
}
