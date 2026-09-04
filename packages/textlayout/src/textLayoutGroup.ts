import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { TextFormat, TextLayoutGroup } from '@flighthq/types/contract';

export function createTextLayoutGroup(format: TextFormat, startIndex: number, endIndex: number): TextLayoutGroup {
  const out = allocateEntity<TextLayoutGroup>();
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
  return finishEntity(out);
}
