import type { InputTextData } from './InputTextData';
import type { RichText } from './RichText';

export interface InputText extends RichText {
  data: InputTextData;
}
