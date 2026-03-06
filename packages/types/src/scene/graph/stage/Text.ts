import type { DisplayObject, PrimitiveData } from './DisplayObject';
import type { TextAutoSize } from './TextAutoSize';
import type { TextFormat } from './TextFormat';

export interface TextData extends PrimitiveData {
  autoSize: TextAutoSize;
  text: string;
  textFormat: TextFormat;
}

export interface Text extends DisplayObject {
  data: TextData;
}
