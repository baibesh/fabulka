import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LANGUAGES, localePath } from '@fabulka/shared';

/** The cache tags the site's SEO data carries (apps/web/src/lib/seo-data.ts). */
export const SEO_TAG = 'seo';
export const REDIRECTS_TAG = 'seo-redirects';

export type IndexNowResult = 'sent' | 'off' | 'failed' | 'skipped';

/**
 * What the API tells the outside after an SEO change: the site re-renders the tagged pages at once
 * (POST WEB_INTERNAL_URL/internal/revalidate with REVALIDATE_SECRET), and IndexNow (Bing, Yandex,
 * Seznam, Naver…) hears which addresses changed (INDEXNOW_KEY; off without it). Neither failing
 * fails the change itself: the site picks it up within its cache lifetime anyway.
 */
@Injectable()
export class SeoWebService {
  private readonly logger = new Logger(SeoWebService.name);
  private readonly webUrl: string;
  private readonly secret: string;
  private readonly publicUrl: string;
  readonly indexNowKey: string;
  private readonly indexNowEndpoint: string;

  constructor(config: ConfigService) {
    this.webUrl = config
      .get<string>('WEB_INTERNAL_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    this.secret = config.get<string>('REVALIDATE_SECRET', '');
    this.publicUrl = config
      .get<string>('PUBLIC_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    this.indexNowKey = config.get<string>('INDEXNOW_KEY', '').trim();
    this.indexNowEndpoint = config.get<string>(
      'INDEXNOW_ENDPOINT',
      'https://api.indexnow.org/indexnow',
    );
    if (!this.secret) {
      this.logger.warn(
        'REVALIDATE_SECRET is not set: SEO changes reach the site only when its cache expires',
      );
    }
  }

  /** Expires the site's cached data under these tags; false when it could not be told. */
  async revalidate(tags: string[]): Promise<boolean> {
    if (!this.secret) return false;
    try {
      const response = await fetch(`${this.webUrl}/internal/revalidate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': this.secret,
        },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        this.logger.warn(`revalidation refused: ${response.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(`revalidation failed: ${message(error)}`);
      return false;
    }
  }

  /** Every language version of these site paths, as absolute URLs. */
  urls(paths: string[]): string[] {
    const absolute = (path: string) =>
      path === '/' ? this.publicUrl : `${this.publicUrl}${path}`;
    return [
      ...new Set(
        paths.flatMap((path) =>
          LANGUAGES.map((language) => absolute(localePath(language, path))),
        ),
      ),
    ];
  }

  /** Tells IndexNow these URLs changed. */
  async pingIndexNow(urls: string[]): Promise<IndexNowResult> {
    if (!this.indexNowKey) return 'off';
    if (!urls.length) return 'skipped';
    const host = new URL(this.publicUrl).host;
    try {
      const response = await fetch(this.indexNowEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host,
          key: this.indexNowKey,
          keyLocation: `${this.publicUrl}/${this.indexNowKey}.txt`,
          urlList: urls.slice(0, 10_000),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      // 200 OK and 202 Accepted are both success.
      if (response.ok) return 'sent';
      this.logger.warn(`IndexNow refused: ${response.status}`);
      return 'failed';
    } catch (error) {
      this.logger.warn(`IndexNow failed: ${message(error)}`);
      return 'failed';
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
