import type { TextFormat } from '@flighthq/types';

export interface TextLayoutGroup {
  ascent: number;
  descent: number;
  endIndex: number;
  format: TextFormat;
  height: number;
  leading: number;
  lineIndex: number;
  offsetX: number;
  offsetY: number;
  /** Per-character advance widths in pixels. */
  positions: number[];
  startIndex: number;
  width: number;
}

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
