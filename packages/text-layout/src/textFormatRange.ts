import type { TextFormat } from '@flighthq/types';

export interface TextFormatRange {
  end: number;
  format: TextFormat;
  start: number;
}

export function createTextFormatRange(format: TextFormat, start: number, end: number): TextFormatRange {
  return { end, format, start };
}
