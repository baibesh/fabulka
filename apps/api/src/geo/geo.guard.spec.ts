import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { REFERENCE_KEYS, REGION_UNAVAILABLE } from '@fabulka/shared';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { ReferenceService } from '../reference/reference.service';
import { clientIp, GeoGuard } from './geo.guard';
import { GeoService } from './geo.service';

function context(path: string, realIp?: string): ExecutionContext {
  const request = {
    path,
    headers: realIp ? { 'x-real-ip': realIp } : {},
    socket: { remoteAddress: '::ffff:127.0.0.1' },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/** The reference data with the owner's extra blocked countries stored. */
function reference(extra: unknown = []): ReferenceService {
  const findMany = () =>
    Promise.resolve([{ key: REFERENCE_KEYS.extraBlocked, value: extra }]);
  return new ReferenceService({
    setting: { findMany },
  } as unknown as PrismaService);
}

/** A GeoService whose database knows a few addresses. */
function geo(enabled = true, extra: unknown = []): GeoService {
  const service = new GeoService(
    {
      get: (key: string, fallback: string) =>
        key === 'GEO_BLOCK' ? String(enabled) : fallback,
    } as unknown as ConfigService,
    reference(extra),
  );
  const countries: Record<string, string> = {
    '77.88.8.8': 'RU',
    '49.44.0.1': 'IN',
    '212.116.234.61': 'KZ',
    '193.0.6.139': 'NL',
  };
  jest
    .spyOn(service, 'country')
    .mockImplementation((ip) => countries[ip] ?? null);
  return service;
}

describe('GeoGuard', () => {
  it('turns away a restricted country with 451', async () => {
    const guard = new GeoGuard(geo());
    try {
      await guard.canActivate(context('/api/books', '77.88.8.8'));
      fail('expected a 451');
    } catch (error) {
      const http = error as { getStatus(): number; getResponse(): unknown };
      expect(http.getStatus()).toBe(451);
      expect(http.getResponse()).toMatchObject({
        code: REGION_UNAVAILABLE,
        country: 'RU',
      });
    }
  });

  it('blocks India, where Muse Image is not available', async () => {
    await expect(
      new GeoGuard(geo()).canActivate(context('/api/templates', '49.44.0.1')),
    ).rejects.toThrow();
  });

  it('lets Kazakhstan, unknown and local addresses through', async () => {
    const guard = new GeoGuard(geo());
    expect(
      await guard.canActivate(context('/api/books', '212.116.234.61')),
    ).toBe(true);
    expect(await guard.canActivate(context('/api/books', '10.0.0.5'))).toBe(
      true,
    );
    expect(await guard.canActivate(context('/api/books'))).toBe(true);
    expect(await guard.canActivate(context('/api/books', '193.0.6.139'))).toBe(
      true,
    );
  });

  it('also turns away the countries the owner blocked in the admin', async () => {
    const guard = new GeoGuard(geo(true, ['NL']));
    await expect(
      guard.canActivate(context('/api/books', '193.0.6.139')),
    ).rejects.toMatchObject({ response: { country: 'NL' } });
    await expect(
      guard.canActivate(context('/api/books', '77.88.8.8')),
    ).rejects.toThrow();
    expect(
      await guard.canActivate(context('/api/books', '212.116.234.61')),
    ).toBe(true);
  });

  it('keeps Meta’s countries blocked whatever the admin stored', async () => {
    for (const extra of [[], ['RU'], 'garbage']) {
      await expect(
        new GeoGuard(geo(true, extra)).canActivate(
          context('/api/books', '77.88.8.8'),
        ),
      ).rejects.toMatchObject({ response: { country: 'RU' } });
    }
  });

  it('keeps the health check open', async () => {
    expect(
      await new GeoGuard(geo()).canActivate(
        context('/api/health', '77.88.8.8'),
      ),
    ).toBe(true);
  });

  it('lets everyone through when blocking is off', async () => {
    expect(
      await new GeoGuard(geo(false)).canActivate(
        context('/api/books', '77.88.8.8'),
      ),
    ).toBe(true);
  });
});

describe('clientIp', () => {
  it('prefers X-Real-IP from nginx over the socket address', () => {
    const request = {
      headers: { 'x-real-ip': ' 77.88.8.8 ' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
    expect(clientIp(request)).toBe('77.88.8.8');
  });
});
