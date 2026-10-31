import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JournalModule, JournalService } from '../journal/journal.service';
import { MetaGateway } from './meta.gateway';
import { MockGateway } from './mock.gateway';
import { MODEL_GATEWAY, type ModelGateway } from './model-gateway';

/** The only place that knows which models Fabulka talks to. MODELS=mock|meta. */
@Global()
@Module({
  imports: [JournalModule],
  providers: [
    {
      provide: MODEL_GATEWAY,
      inject: [ConfigService, JournalService],
      useFactory: (
        config: ConfigService,
        journal: JournalService,
      ): ModelGateway => {
        const mode = config.get<string>('MODELS', 'mock');
        new Logger('MetaModule').log(`models: ${mode}`);
        if (mode === 'mock')
          return new MockGateway(
            Number(config.get('MOCK_DELAY_MS', 300)),
            journal,
          );
        if (mode !== 'meta')
          throw new Error(`MODELS must be mock or meta, got "${mode}"`);
        return new MetaGateway(
          {
            apiKey: config.getOrThrow<string>('MODEL_API_KEY'),
            baseURL: config.get('MODEL_API_BASE_URL', 'https://api.meta.ai/v1'),
            storyModel: config.get('STORY_MODEL', 'muse-spark-1.3'),
            imageModel: config.get('IMAGE_MODEL', 'muse-image-1.0'),
            samModel: config.get('SAM_MODEL', 'sam-3.1'),
          },
          journal,
        );
      },
    },
  ],
  exports: [MODEL_GATEWAY],
})
export class MetaModule {}
