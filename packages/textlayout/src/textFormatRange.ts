import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, TextFormat, TextFormatRange } from '@flighthq/types/contract';

export function createTextFormatRange(format: TextFormat, start: number, end: number): TextFormatRange {
  return createEntity<EntityWithoutRuntime<TextFormatRange>>({ end, format, start });
}
