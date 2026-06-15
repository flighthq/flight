import type { TextAutoSize } from './TextAutoSize';
import type { TextFormat } from './TextFormat';
import type { TextFormatRange } from './TextFormatRange';

export type TextMeasureFunction = (text: string, format: TextFormat) => number;

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

export interface TextLayoutParams {
  autoSize?: TextAutoSize;
  border?: boolean;
  formatRanges: readonly TextFormatRange[];
  height: number;
  measure: TextMeasureFunction;
  multiline?: boolean;
  text: string;
  width: number;
  wordWrap?: boolean;
}

export interface TextLayoutResult {
  groups: TextLayoutGroup[];
  lineAscents: number[];
  lineDescents: number[];
  lineHeights: number[];
  lineLeadings: number[];
  lineWidths: number[];
  numLines: number;
  textHeight: number;
  textWidth: number;
}
