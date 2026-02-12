import type DisplayObject from './DisplayObject.js';
import type { DisplayObjectSymbols as $ } from './DisplayObjectSymbols.js';

export default interface DisplayObjectContainer extends DisplayObject {
  [$.children]: DisplayObject[];
}
