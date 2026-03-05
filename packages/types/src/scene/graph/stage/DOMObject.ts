import type DisplayObject from './DisplayObject';
import type DOMObjectData from './DOMObjectData';

export default interface DOMObject extends DisplayObject {
  data: DOMObjectData;
}
