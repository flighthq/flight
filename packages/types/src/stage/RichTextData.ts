import type { PrimitiveData } from './PrimitiveData';
import type TextAutoSize from './TextAutoSize';
import type TextFormat from './TextFormat';

export default interface RichTextData extends PrimitiveData {
  autoSize: TextAutoSize;
  background: boolean;
  backgroundColor: number;
  border: boolean;
  borderColor: number;
  condenseWhite: boolean;
  defaultTextFormat: TextFormat;
  htmlText: string;
  maxChars: number;
  mouseWheelEnabled: boolean;
  multiline: boolean;
  scrollH: number;
  scrollV: number;
  selectable: boolean;
  styleSheet: StyleSheet;
  text: string;
  textColor: number;
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
