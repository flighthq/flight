import type { TextAutoSize } from './TextAutoSize';
import type { TextDirection } from './TextDirection';
import type { TextFormat } from './TextFormat';
import type { TextFormatRange } from './TextFormatRange';
import type { TextJustification } from './TextJustification';

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
  // Base writing direction; resolves the 'start'/'end' alignment aliases. Defaults to 'LeftToRight'.
  direction?: TextDirection;
  formatRanges: readonly TextFormatRange[];
  height: number;
  // Inter-word/inter-character distribution mode for justified lines. Defaults to 'interWord'.
  justification?: TextJustification;
  // Maximum line count before truncation; -1 (the default) means unlimited.
  maxLines?: number;
  measure: TextMeasureFunction;
  multiline?: boolean;
  text: string;
  // Character appended to the final line when truncated by maxLines. Defaults to the ellipsis '…'.
  truncationCharacter?: string;
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
