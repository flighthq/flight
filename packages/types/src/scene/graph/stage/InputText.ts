import type InputTextData from './InputTextData';
import type RichText from './RichText';

export default interface InputText extends RichText {
  data: InputTextData;
}
