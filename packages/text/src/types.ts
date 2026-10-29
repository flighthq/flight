import type { EntityRaw } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';
import type { TextFormat, TextFormatAlign, TextFormatRangeRaw as TextFormatRange } from '@flighthq/textformat/contract';
import type {
  RichTextContent,
  TextAutoSize,
  TextLayoutParams,
  TextLayoutResult,
  TextMeasureFunction,
  TextVerticalAlign,
} from '@flighthq/textlayout/contract';
import type { Node2D, Node2DData, Node2DRuntime } from '@flighthq/types/contract';

export interface TextLabelData extends Node2DData {
  autoSize: TextAutoSize;
  height: number;
  text: string;
  textFormat: TextFormat;
  verticalAlign: TextVerticalAlign;
  width: number;
}

export interface TextLabelRuntime extends Node2DRuntime {
  buildTextLayoutParams: (source: Readonly<TextLabel>, measure: TextMeasureFunction) => TextLayoutParams;
  textLayout: TextLayoutResult | null;
  textLayoutUsingContentId: number;
  textLayoutUsingText: string | null;
}

export interface TextLabel extends Node2D {
  data: TextLabelData;
}

export const TextLabelKind = 'TextLabel';

export interface NativeTextStyle {
  align?: TextFormatAlign;
  bold?: boolean;
  color?: number;
  font?: string;
  italic?: boolean;
  leading?: number;
  size?: number;
}

export interface NativeTextData extends Node2DData {
  autoSize: TextAutoSize;
  height: number;
  style: NativeTextStyle;
  text: string;
  verticalAlign: TextVerticalAlign;
  width: number;
}

export interface NativeTextRuntime extends Node2DRuntime {
  element: HTMLElement | null;
  measuredHeight: number;
  measuredWidth: number;
}

export interface NativeText extends Node2D {
  data: NativeTextData;
}

export const NativeTextKind = 'NativeText';

export interface TextInputHistoryEntry {
  caretIndexAfter: number;
  caretIndexBefore: number;
  mergeKind: string | null;
  selectionIndexAfter: number;
  selectionIndexBefore: number;
  textAfter: string;
  textBefore: string;
}

export interface TextInputState {
  alwaysShowSelection: boolean;
  caretColor: number;
  caretIndex: number;
  caretWidth: number;
  desiredCaretX: number;
  displayAsPassword: boolean;
  focused: boolean;
  history: TextInputHistoryEntry[];
  historyIndex: number;
  historyLimit: number;
  passwordCharacter: string;
  restrict: string;
  selectionAlpha: number;
  selectionColor: number;
  selectionIndex: number;
}

export interface TextInputOptions {
  alwaysShowSelection?: boolean;
  caretColor?: number;
  caretWidth?: number;
  displayAsPassword?: boolean;
  historyLimit?: number;
  passwordCharacter?: string;
  restrict?: string;
  selectionAlpha?: number;
  selectionColor?: number;
}

export interface TextFieldChangeEvent {
  previousText: string;
  text: string;
}

export interface TextFieldLinkEvent {
  url: string;
  x: number;
  y: number;
}

export interface TextFieldScrollEvent {
  previousScrollH: number;
  previousScrollV: number;
  scrollH: number;
  scrollV: number;
}

export interface TextFieldSignals extends EntityRaw {
  onTextFieldChange: Signal<Readonly<TextFieldChangeEvent>>;
  onTextFieldLink: Signal<Readonly<TextFieldLinkEvent>>;
  onTextFieldScroll: Signal<Readonly<TextFieldScrollEvent>>;
}

export interface RichTextData extends TextLabelData {
  background: boolean;
  backgroundColor: number;
  border: boolean;
  borderColor: number;
  condenseWhite: boolean;
  defaultTextFormat: TextFormat;
  maxChars: number;
  mouseWheelEnabled: boolean;
  multiline: boolean;
  scrollH: number;
  scrollV: number;
  selectable: boolean;
  textColor: number;
  textFormatRanges: TextFormatRange[];
  wordWrap: boolean;
}

export interface RichTextRuntime extends TextLabelRuntime {
  input: TextInputState | null;
  richTextContent: RichTextContent | undefined;
  selectionBeginIndex: number;
  selectionEndIndex: number;
  textFieldSignals: TextFieldSignals | null;
}

export interface RichText extends TextLabel {
  data: RichTextData;
}

export const RichTextKind = 'RichText';

export interface TextLabelContentExplanation {
  agreement: boolean;
  liveString: string;
  rasterizedString: string | null;
  revision: number;
}
