import type { RichTextData } from './RichTextData';

export interface InputTextData extends RichTextData {
  displayAsPassword: boolean;
  restrict: string;
}
