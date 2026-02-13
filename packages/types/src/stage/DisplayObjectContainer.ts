import type DisplayObject from './DisplayObject.js';
import type { DisplayObjectDerivedState } from './DisplayObjectDerivedState.js';

export default interface DisplayObjectContainer extends DisplayObject {
  // Override derived state to ensure children[] is always defined and not null
  [DisplayObjectDerivedState.Key]: DisplayObjectDerivedState & {
    children: DisplayObject[];
  };
}
