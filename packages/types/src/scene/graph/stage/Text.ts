import type { DisplayObject } from './DisplayObject';
import type { TextData } from './TextData';

export interface Text extends DisplayObject {
  data: TextData;
}
