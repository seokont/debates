import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DataLicensingService } from './data-licensing.service';
import { AccessLicenseDto } from './dto/access-license.dto';
import { CreateLicenseDto } from './dto/create-license.dto';

@ApiTags('Data Licensing')
@Controller('data-licensing')
export class DataLicensingController {
  constructor(private readonly dataLicensingService: DataLicensingService) {}

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a data license for a completed debate' })
  @ApiCreatedResponse({ description: 'License created (unpublished)' })
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLicenseDto) {
    return this.dataLicensingService.createLicense(user, dto);
  }

  @ApiOperation({ summary: 'Browse published dataset marketplace' })
  @ApiOkResponse({ description: 'Published licenses ordered by usage' })
  @Get('marketplace')
  marketplace() {
    return this.dataLicensingService.listMarketplace();
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my data licenses and usage stats' })
  @ApiOkResponse({ description: 'My licenses' })
  @UseGuards(JwtAuthGuard)
  @Get('my')
  myLicenses(@CurrentUser() user: AuthenticatedUser) {
    return this.dataLicensingService.myLicenses(user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish a license to the marketplace' })
  @ApiParam({ name: 'id' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  publish(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dataLicensingService.publishLicense(id, user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unpublish a license from the marketplace' })
  @ApiParam({ name: 'id' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/unpublish')
  unpublish(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dataLicensingService.unpublishLicense(id, user.id);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Purchase access to a licensed dataset (debits credits, returns full debate data)' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Access granted — full debate data returned' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/access')
  access(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AccessLicenseDto,
  ) {
    return this.dataLicensingService.accessLicense(id, user, dto);
  }
}
