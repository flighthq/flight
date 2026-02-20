import type DisplayObject from './DisplayObject';
import type DOMElementData from './DOMElementData';

export default interface DOMElement extends DisplayObject {
  data: DOMElementData;
}
