import type { RichTextContent } from './RichTextContent';
import type { TextAutoSize } from './TextAutoSize';
import type { TextFieldSignals } from './TextFieldSignals';
import type { TextFormat } from './TextFormat';
import type { TextFormatRange } from './TextFormatRange';
import type { TextInputState } from './TextInputState';
import type { TextLabel, TextLabelData, TextLabelRuntime } from './TextLabel';

export interface RichTextData extends TextLabelData {
  autoSize: TextAutoSize;
  background: boolean;
  // Box fill as a 24-bit RGB integer (`0xRRGGBB`), which is NOT the encoding `textColor` below carries:
  // the two colors on this one interface are read differently, and every backend converts this pair with
  // the RGB helper and that one with the RGBA helper. Default 0xffffff — white as RGB, cyan as RGBA.
  backgroundColor: number;
  border: boolean;
  // Box outline as a 24-bit RGB integer (`0xRRGGBB`), same encoding as backgroundColor above.
  borderColor: number;
  condenseWhite: boolean;
  defaultTextFormat: TextFormat;
  height: number;
  maxChars: number;
  mouseWheelEnabled: boolean;
  multiline: boolean;
  scrollH: number;
  scrollV: number;
  selectable: boolean;
  text: string;
  // Field color as Flight's packed sRGB RGBA integer (`0xRRGGBBAA`); alpha is linear coverage.
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
  // in @flighthq/textinput. A nullable slot (rather than a separate entity) is what lets selection/
  // caret/input be an opt-in mode of RichText with zero cost when unused. Renderers draw the caret/
  // selection overlay only when this is non-null.
  input: TextInputState | null;
  richTextContent: RichTextContent | null;
  selectionBeginIndex: number;
  selectionEndIndex: number;
  // The opt-in text-field notification group: null until enableTextFieldSignals(source) is called.
  // Setters emit change/scroll/link events only when this is non-null, so a field that never enables
  // signals pays nothing.
  textFieldSignals: TextFieldSignals | null;
}

export interface RichText extends TextLabel {
  data: RichTextData;
}

export const RichTextKind = 'RichText';
