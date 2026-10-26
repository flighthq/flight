export type { TextFormatRange } from '@flighthq/types/contract';

import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction, TextFormatRange } from '@flighthq/types/contract';

import type { TextFormat } from './textFormat.ts';

export function createTextFormatRange(format: TextFormat, start: number, end: number): TextFormatRange {
  const out = allocateEntity<TextFormatRange>();
  initializeTextFormatRange(out, format, start, end);
  return finishEntity(out);
}

export function initializeTextFormatRange(
  out: EntityConstruction<TextFormatRange>,
  format: TextFormat,
  start: number,
  end: number,
): void {
  out.end = end;
  out.format = format;
  out.start = start;
}
