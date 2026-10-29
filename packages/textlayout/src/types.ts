import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { TextFormat, TextFormatRangeRaw } from '@flighthq/textformat/contract';
import type { TextDirection, TextMeasureFunction } from '@flighthq/textshaper/contract';

export interface RichTextContent extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  formatRanges: TextFormatRangeRaw[];
  text: string;
}

export const TextAutoSize = {
  Center: 'center',
  Left: 'left',
  None: 'none',
  Right: 'right',
} as const;

export type TextAutoSize = (typeof TextAutoSize)[keyof typeof TextAutoSize];

export type TextBoundsSpec = Readonly<{
  autoSize: TextAutoSize;
  height: number;
  width: number;
  wordWrap?: boolean;
}>;

export const TextJustification = {
  InterCharacter: 'interCharacter',
  InterWord: 'interWord',
  None: 'none',
} as const;

export type TextJustification = (typeof TextJustification)[keyof typeof TextJustification];

export interface TextLayoutGroup extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
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
  /** Base writing direction; resolves the `start`/`end` alignment aliases. */
  direction?: TextDirection;
  formatRanges: readonly TextFormatRangeRaw[];
  height: number;
  /** Inter-word/inter-character distribution mode for justified lines. */
  justification?: TextJustification;
  /** Maximum line count before truncation; -1 means unlimited. */
  maxLines?: number;
  measure: TextMeasureFunction;
  multiline?: boolean;
  text: string;
  /** Character appended to the final line when truncated by maxLines. */
  truncationCharacter?: string;
  verticalAlign?: TextVerticalAlign;
  width: number;
  wordWrap?: boolean;
}

export interface TextLayoutResult extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
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

export interface TextLineMetrics {
  ascent: number;
  descent: number;
  height: number;
  leading: number;
  width: number;
  x: number;
}

export interface TextMetrics extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  height: number;
  numLines: number;
  width: number;
}

export interface TextSelectionRectangle {
  height: number;
  lineIndex: number;
  width: number;
  x: number;
  y: number;
}

export const TextVerticalAlign = {
  Bottom: 'bottom',
  Middle: 'middle',
  Top: 'top',
} as const;

export type TextVerticalAlign = (typeof TextVerticalAlign)[keyof typeof TextVerticalAlign];
