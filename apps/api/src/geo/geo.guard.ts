import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { REGION_UNAVAILABLE } from '@fabulka/shared';
import type { Request } from 'express';
import { GeoService } from './geo.service';

/** 451 Unavailable For Legal Reasons. */
const UNAVAILABLE_FOR_LEGAL_REASONS = 451;

/**
 * Turns away visitors from countries where Meta's models may not be offered, and from those the
 * owner blocked in the admin, before any route runs, so no model is ever called for them. The health check stays open for monitoring.
 */
@Injectable()
export class GeoGuard implements CanActivate {
  constructor(private readonly geo: GeoService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path === '/api/health') return true;
    const country = await this.geo.restricted(clientIp(request));
    if (!country) return true;
    throw new HttpException(
      {
        code: REGION_UNAVAILABLE,
        country,
        message:
          'Сервис недоступен в вашей стране. / This service is not available in your country.',
      },
      UNAVAILABLE_FOR_LEGAL_REASONS,
    );
  }
}

/**
 * The visitor's address. In production host nginx sets X-Real-IP and the API is reachable only
 * through it, so the header can be trusted; without it, the socket address.
 */
export function clientIp(request: Request): string {
  const header = request.headers['x-real-ip'];
  const value = (Array.isArray(header) ? header[0] : header)?.trim();
  return value || request.socket.remoteAddress || '';
}
