import type { PrimitiveData } from './PrimitiveData';
import type TextAutoSize from './TextAutoSize';
import type TextFormat from './TextFormat';

export default interface StaticTextData extends PrimitiveData {
  autoSize: TextAutoSize;
  text: string;
  textFormat: TextFormat;
}
