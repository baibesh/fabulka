import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type CountryResponse, Reader } from 'maxmind';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ReferenceService } from '../reference/reference.service';

/** Which country a visitor is in, from the DB-IP country database (`pnpm geoip`). */
@Injectable()
export class GeoService implements OnModuleInit {
  private readonly logger = new Logger(GeoService.name);
  readonly enabled: boolean;
  private readonly dbPath: string;
  private reader: Reader<CountryResponse> | null = null;

  constructor(
    config: ConfigService,
    private readonly reference: ReferenceService,
  ) {
    this.enabled = config.get('GEO_BLOCK', 'false') === 'true';
    this.dbPath = resolve(config.get('GEOIP_DB', './geoip/country.mmdb'));
  }

  onModuleInit() {
    if (!this.enabled) return;
    // Fails the start rather than serving everyone when blocking is on and the database is missing.
    this.reader = new Reader<CountryResponse>(readFileSync(this.dbPath));
    this.logger.log(`geo block on (${this.dbPath})`);
  }

  /** ISO country code, or null for private addresses and unknown ones. */
  country(ip: string): string | null {
    return (
      this.reader?.get(ip.replace(/^::ffff:/, ''))?.country?.iso_code ?? null
    );
  }

  /**
   * The blocked country the IP is in (Meta's list or one the owner added in the admin), or null
   * when the visitor may use the service.
   */
  async restricted(ip: string): Promise<string | null> {
    if (!this.enabled) return null;
    const country = this.country(ip);
    if (!country) return null;
    return (await this.reference.blocked(country)) ? country : null;
  }
}
