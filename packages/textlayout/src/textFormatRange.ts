import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, EntityWithoutRuntime, TextFormat, TextFormatRange } from '@flighthq/types/contract';

export function createTextFormatRange(format: TextFormat, start: number, end: number): TextFormatRange {
  const out = allocateEntity<TextFormatRange>();
  out.end = end;
  out.format = format;
  out.start = start;
  return finishEntity(out);
}
