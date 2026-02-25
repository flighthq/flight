import type DisplayObject from './DisplayObject';
import type DOMElementData from './DOMObjectData';

export default interface DOMElement extends DisplayObject {
  data: DOMElementData;
}
