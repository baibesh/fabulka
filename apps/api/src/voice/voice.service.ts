import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  VOICE_FAILED,
  VOICE_RATE_LIMITED,
  type VoicePrefill,
  type VoiceRequest,
} from '@fabulka/shared';
import { WindowLimiter } from '../common/limiter';
import { MODEL_GATEWAY, type ModelGateway } from '../meta/model-gateway';
import { TemplatesService } from '../templates/templates.service';

const HOUR_MS = 60 * 60 * 1000;

/** Turns the parent's recording into form fields. The audio lives only in this request's memory. */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly limiter: WindowLimiter;

  constructor(
    @Inject(MODEL_GATEWAY) private readonly models: ModelGateway,
    private readonly templates: TemplatesService,
    config: ConfigService,
  ) {
    this.limiter = new WindowLimiter(
      Number(config.get('VOICE_HOURLY_LIMIT', 20)),
      HOUR_MS,
    );
  }

  async prefill(
    wav: Buffer,
    { language, template }: VoiceRequest,
    clientKey: string,
  ): Promise<VoicePrefill> {
    // A 404 for an unknown book comes before the recording counts against the visitor.
    const questions = template
      ? (await this.templates.get(template, language)).questions
      : undefined;
    if (!this.limiter.take(clientKey)) {
      throw new HttpException(
        {
          code: VOICE_RATE_LIMITED,
          message: 'Слишком много записей подряд, попробуйте через час',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      const heard = await this.models.transcribe(wav, language);
      if (!heard.text) return { transcript: '', child: {} };
      const { fields, costUsd } = await this.models.extractPrefill({
        transcript: heard.text,
        language,
        questions,
        theme: !template,
      });
      this.logger.log(
        `voice prefill: $${(heard.costUsd + costUsd).toFixed(4)}`,
      );
      return { transcript: heard.text, ...fields };
    } catch (error) {
      this.logger.error('voice prefill failed', error);
      throw new HttpException(
        {
          code: VOICE_FAILED,
          message: 'Не получилось распознать запись, попробуйте ещё раз',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
