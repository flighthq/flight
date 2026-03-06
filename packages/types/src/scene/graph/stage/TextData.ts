import type { PrimitiveData } from './PrimitiveData';
import type { TextAutoSize } from './TextAutoSize';
import type { TextFormat } from './TextFormat';

export interface TextData extends PrimitiveData {
  autoSize: TextAutoSize;
  text: string;
  textFormat: TextFormat;
}
