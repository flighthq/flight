import type { RichTextContent } from './RichTextContent';
import type { RichTextStyleSheet } from './RichTextStyleSheet';
import type { Text, TextData, TextRuntime } from './Text';
import type { TextAutoSize } from './TextAutoSize';
import type { TextFormat } from './TextFormat';
import type { TextFormatRange } from './TextFormatRange';

export interface RichTextData extends TextData {
  autoSize: TextAutoSize;
  background: boolean;
  backgroundColor: number;
  border: boolean;
  borderColor: number;
  condenseWhite: boolean;
  defaultTextFormat: TextFormat;
  height: number;
  htmlText: string;
  maxChars: number;
  mouseWheelEnabled: boolean;
  multiline: boolean;
  readonly scrollH: number;
  readonly scrollV: number;
  selectable: boolean;
  styleSheet: RichTextStyleSheet | null;
  text: string;
  textColor: number;
  textFormatRanges: TextFormatRange[];
  width: number;
  wordWrap: boolean;

  // getBottomScrollV(source: Readonly<DynamicText>): number;
  // getCaretIndex(source: Readonly<DynamicText>): number;
  // getLength(source: Readonly<DynamicText>): number;
  // getMaxScrollH(source: Readonly<DynamicText>): number;
  // getMaxScrollV(source: Readonly<DynamicText>): number;
  // getNumLines(source: Readonly<DynamicText>): number;
  // getSelectionBeginIndex(source: Readonly<DynamicText>): number;
  // getSelectionEndIndex(source: Readonly<DynamicText>): number;
  // getTextHeight(source: Readonly<DynamicText>): number;
  // getTextWidth(source: Readonly<DynamicText>): number;
}

export interface RichTextRuntime extends TextRuntime {
  richTextContent: RichTextContent | null;
  selectionBeginIndex: number;
  selectionEndIndex: number;
}

export interface RichText extends Text {
  data: RichTextData;
}

export const RichTextKind: unique symbol = Symbol('RichText');
