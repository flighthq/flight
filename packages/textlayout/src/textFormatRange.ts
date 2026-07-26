import type { TextFormat, TextFormatRange } from '@flighthq/types/contract';

export function createTextFormatRange(format: TextFormat, start: number, end: number): TextFormatRange {
  return { end, format, start };
}
