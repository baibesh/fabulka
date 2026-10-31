import { Controller, Get } from '@nestjs/common';
import type { Reference } from '@fabulka/shared';
import { ReferenceService } from './reference.service';

@Controller('reference')
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  /** The owner's prices and delivery cities: the site prices books and orders from these. */
  @Get()
  get(): Promise<Reference> {
    return this.reference.public();
  }
}
