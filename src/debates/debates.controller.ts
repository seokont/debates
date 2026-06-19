import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuthenticatedUser } from "../auth/types/authenticated-user.type";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { CreateInjectionDto } from "./dto/create-injection.dto";
import { CreateDebateDto } from "./dto/create-debate.dto";
import { CreateDebateFromUrlDto } from "./dto/create-debate-from-url.dto";
import { CreateBranchDto } from "./dto/create-branch.dto";
import { DebatesService } from "./debates.service";

@ApiTags("Debates")
@Controller("debates")
export class DebatesController {
  constructor(private readonly debatesService: DebatesService) {}

  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create debate, charge 1 credit, and enqueue worker job",
  })
  @ApiCreatedResponse({ description: "Debate created and queued" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDebateDto) {
    return this.debatesService.create(user, dto);
  }

  @ApiOperation({
    summary: "Auto-detect whether a thesis is VERIFY, EXPLORE, or QUANTUM",
  })
  @ApiOkResponse({ description: "Mode detection result with confidence" })
  @Get("detect-mode")
  detectMode(@Query("thesis") thesis: string) {
    return this.debatesService.detectMode(thesis ?? "");
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: "List public debates and own private debates when authorized",
  })
  @ApiOkResponse({ description: "Debate list" })
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user?: AuthenticatedUser) {
    return this.debatesService.findAll(user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Get final debate result" })
  @ApiParam({ name: "id", description: "Debate UUID" })
  @ApiOkResponse({ description: "Final debate result" })
  @UseGuards(OptionalJwtAuthGuard)
  @Get(":id/final")
  findFinal(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.debatesService.findFinal(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get cross-domain insights and profit patterns for a debate",
  })
  @ApiParam({ name: "id", description: "Debate UUID" })
  @ApiOkResponse({ description: "Cross-domain insights" })
  @UseGuards(OptionalJwtAuthGuard)
  @Get(":id/insights")
  getInsights(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.debatesService.getInsights(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Stream debate events with Server-Sent Events" })
  @ApiParam({ name: "id", description: "Debate UUID" })
  @UseGuards(OptionalJwtAuthGuard)
  @Sse(":id/stream")
  stream(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.debatesService.stream(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Add a human injection to a debate" })
  @ApiParam({ name: "id", description: "Debate UUID" })
  @ApiCreatedResponse({ description: "Human injection created" })
  @UseGuards(JwtAuthGuard)
  @Post(":id/injections")
  createInjection(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInjectionDto,
  ) {
    return this.debatesService.createInjection(id, user, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "List human injections for a debate" })
  @ApiParam({ name: "id", description: "Debate UUID" })
  @ApiOkResponse({ description: "Human injections" })
  @UseGuards(OptionalJwtAuthGuard)
  @Get(":id/injections")
  listInjections(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.debatesService.listInjections(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Add a comment to a debate" })
  @ApiParam({ name: "id", description: "Debate UUID" })
  @ApiCreatedResponse({ description: "Comment created" })
  @UseGuards(JwtAuthGuard)
  @Post(":id/comments")
  createComment(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommentDto,
  ) {
    return this.debatesService.createComment(id, user, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "List comments for a debate" })
  @ApiParam({ name: "id", description: "Debate UUID" })
  @ApiOkResponse({ description: "Comment list" })
  @UseGuards(OptionalJwtAuthGuard)
  @Get(":id/comments")
  listComments(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.debatesService.listComments(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Get debate by id" })
  @ApiParam({ name: "id", description: "Debate UUID" })
  @ApiOkResponse({ description: "Debate with rounds and events" })
  @UseGuards(OptionalJwtAuthGuard)
  @Get(":id")
  findOne(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.debatesService.findOne(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Restart failed, completed, or cancelled debate" })
  @ApiParam({ name: "id", description: "Debate UUID" })
  @ApiOkResponse({ description: "Debate restarted and queued" })
  @ApiUnauthorizedResponse({ description: "Missing or invalid bearer token" })
  @UseGuards(JwtAuthGuard)
  @Post(":id/restart")
  restart(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.debatesService.restart(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Create debate by extracting thesis from a URL" })
  @ApiCreatedResponse({ description: "Debate created from URL content" })
  @UseGuards(JwtAuthGuard)
  @Post("from-url")
  createFromUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDebateFromUrlDto,
  ) {
    return this.debatesService.createFromUrl(user, dto);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: "Create a child debate from a parent debate child question",
  })
  @ApiParam({ name: "id", description: "Parent debate UUID" })
  @ApiCreatedResponse({ description: "Branch debate created and queued" })
  @UseGuards(JwtAuthGuard)
  @Post(":id/branch")
  createBranch(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBranchDto,
  ) {
    return this.debatesService.createBranch(id, user, dto);
  }

  @ApiOperation({ summary: "Get patent opportunity alerts for a debate" })
  @ApiParam({ name: "id", description: "Debate UUID" })
  @ApiOkResponse({ description: "Patent alerts ordered by novelty score" })
  @Get(":id/patents")
  getPatentAlerts(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.debatesService.getPatentAlerts(id);
  }
}

@ApiTags("Injections")
@Controller("injections")
export class InjectionsController {
  constructor(private readonly debatesService: DebatesService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: "Like a human injection" })
  @ApiParam({ name: "id", description: "Injection UUID" })
  @ApiOkResponse({ description: "Injection liked" })
  @UseGuards(JwtAuthGuard)
  @Post(":id/like")
  like(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.debatesService.likeInjection(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Accept a human injection as admin" })
  @ApiParam({ name: "id", description: "Injection UUID" })
  @ApiOkResponse({ description: "Injection accepted" })
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(":id/accept")
  accept(@Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.debatesService.acceptInjection(id);
  }
}

@ApiTags("Comments")
@Controller("comments")
export class CommentsController {
  constructor(private readonly debatesService: DebatesService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: "Like a comment" })
  @ApiParam({ name: "id", description: "Comment UUID" })
  @ApiOkResponse({ description: "Comment liked" })
  @UseGuards(JwtAuthGuard)
  @Post(":id/like")
  like(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.debatesService.likeComment(id, user);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete own comment or delete as admin" })
  @ApiParam({ name: "id", description: "Comment UUID" })
  @ApiOkResponse({ description: "Comment deleted" })
  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  delete(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.debatesService.deleteComment(id, user);
  }
}
