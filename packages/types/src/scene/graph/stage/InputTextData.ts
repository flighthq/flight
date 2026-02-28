import type RichTextData from './RichTextData';

export default interface InputTextData extends RichTextData {
  displayAsPassword: boolean;
  restrict: string;
}
