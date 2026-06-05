import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Search debates by title, original thesis, current thesis, and final summary',
  })
  @ApiOkResponse({ description: 'Search results' })
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  search(
    @Query() query: SearchQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.searchService.search(query.q, user);
  }
}
