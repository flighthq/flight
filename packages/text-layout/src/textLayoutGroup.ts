import type { TextFormat, TextLayoutGroup } from '@flighthq/types';

export function createTextLayoutGroup(format: TextFormat, startIndex: number, endIndex: number): TextLayoutGroup {
  return {
    ascent: 0,
    descent: 0,
    endIndex,
    format,
    height: 0,
    leading: 0,
    lineIndex: 0,
    offsetX: 0,
    offsetY: 0,
    positions: [],
    startIndex,
    width: 0,
  };
}
