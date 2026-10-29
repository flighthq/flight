import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { TextFormat } from '@flighthq/textformat/contract';
import type { EntityConstruction } from '@flighthq/types/contract';

import type { TextLayoutGroup } from './types.ts';

export function createTextLayoutGroup(format: TextFormat, startIndex = 0, endIndex = 0): TextLayoutGroup {
  const out = allocateEntity<TextLayoutGroup>();
  initializeTextLayoutGroup(out, format, startIndex, endIndex);
  return finishEntity(out);
}

export function initializeTextLayoutGroup(
  out: EntityConstruction<TextLayoutGroup>,
  format: TextFormat,
  startIndex = 0,
  endIndex = 0,
): void {
  out.ascent = 0;
  out.descent = 0;
  out.endIndex = endIndex;
  out.format = format;
  out.height = 0;
  out.leading = 0;
  out.lineIndex = 0;
  out.offsetX = 0;
  out.offsetY = 0;
  out.positions = [];
  out.startIndex = startIndex;
  out.width = 0;
}
