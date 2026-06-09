import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { McpServerService } from './mcp-server.service';

@ApiTags('MCP Server')
@Controller('mcp')
export class McpServerController {
  constructor(private readonly mcpService: McpServerService) {}

  @ApiOperation({ summary: 'MCP server info and capabilities' })
  @ApiOkResponse({ description: 'Server info' })
  @Get()
  getInfo() {
    return this.mcpService.getServerInfo();
  }

  @ApiOperation({ summary: 'List available MCP resources (public completed debates + sessions)' })
  @ApiOkResponse({ description: 'Resource list' })
  @Get('resources')
  listResources() {
    return this.mcpService.listResources();
  }

  @ApiOperation({ summary: 'Read a specific MCP resource by URI' })
  @ApiQuery({ name: 'uri', description: 'Resource URI e.g. mind-arena://debates/{id}' })
  @ApiOkResponse({ description: 'Resource content (JSON text)' })
  @Get('resources/read')
  readResource(@Query('uri') uri: string) {
    if (!uri) throw new NotFoundException('uri query param required');
    return this.mcpService.readResource(uri);
  }

  @ApiOperation({ summary: 'List available MCP tools with input schemas' })
  @ApiOkResponse({ description: 'Tool list' })
  @Get('tools')
  listTools() {
    return this.mcpService.listTools();
  }

  @ApiOperation({ summary: 'Call an MCP tool by name' })
  @ApiParam({ name: 'name', description: 'Tool name: explore_idea | get_debate_insights | get_top_patterns' })
  @ApiOkResponse({ description: 'Tool result' })
  @UseGuards(OptionalJwtAuthGuard)
  @Post('tools/:name')
  callTool(
    @Param('name') name: string,
    @Body() args: Record<string, unknown>,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.mcpService.callTool(name, args ?? {}, user?.id);
  }
}
