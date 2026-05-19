import type { RichText, RichTextData } from './RichText';

export interface InputTextData extends RichTextData {
  displayAsPassword: boolean;
  restrict: string;
}

export interface InputText extends RichText {
  data: InputTextData;
}

export const InputTextKind: unique symbol = Symbol('InputText');
