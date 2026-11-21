import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators';

/** Healthcheck sin JWT y sin tocar la base. */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health(): { status: 'ok'; service: 'quadra-api' } {
    return { status: 'ok', service: 'quadra-api' };
  }
}
