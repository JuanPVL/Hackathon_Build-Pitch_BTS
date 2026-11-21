import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators';

/** Healthcheck sin JWT y sin tocar la base. */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOkResponse({ description: 'El API está en pie. No exige JWT ni toca la base.' })
  health(): { status: 'ok'; service: 'quadra-api' } {
    return { status: 'ok', service: 'quadra-api' };
  }
}
