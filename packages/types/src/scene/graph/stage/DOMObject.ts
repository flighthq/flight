import type { DisplayObject } from './DisplayObject';
import type { DOMObjectData } from './DOMObjectData';

export interface DOMObject extends DisplayObject {
  data: DOMObjectData;
}
