import type { RichText, RichTextData, RichTextRuntime } from './RichText';

export interface InputTextData extends RichTextData {
  alwaysShowSelection: boolean;
  displayAsPassword: boolean;
  passwordCharacter: string;
  restrict: string;
  selectionAlpha: number;
  selectionColor: number;
}

export interface InputTextRuntime extends RichTextRuntime {
  caretIndex: number;
  focused: boolean;
  selectionIndex: number;
}

export interface InputText extends RichText {
  data: InputTextData;
}

export const InputTextKind: unique symbol = Symbol('InputText');
