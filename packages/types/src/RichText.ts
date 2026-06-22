import type { RichTextContent } from './RichTextContent';
import type { RichTextStyleSheet } from './RichTextStyleSheet';
import type { TextAutoSize } from './TextAutoSize';
import type { TextFormat } from './TextFormat';
import type { TextFormatRange } from './TextFormatRange';
import type { TextInputState } from './TextInputState';
import type { TextLabel, TextLabelData, TextLabelRuntime } from './TextLabel';

export interface RichTextData extends TextLabelData {
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

export interface RichTextRuntime extends TextLabelRuntime {
  // The editable-field capability slot: null on a static RichText, allocated by enableTextInput(node)
  // in @flighthq/text-input. A nullable slot (rather than a separate entity) is what lets selection/
  // caret/input be an opt-in mode of RichText with zero cost when unused. Renderers draw the caret/
  // selection overlay only when this is non-null.
  input: TextInputState | null;
  richTextContent: RichTextContent | null;
  selectionBeginIndex: number;
  selectionEndIndex: number;
}

export interface RichText extends TextLabel {
  data: RichTextData;
}

export const RichTextKind = 'RichText';
