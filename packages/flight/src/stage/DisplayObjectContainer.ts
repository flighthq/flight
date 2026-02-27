import * as children from '@flighthq/stage/children';

import DisplayObject from './DisplayObject.js';
import { getDisplayObjectFromModel } from './internal/displayObjectMap.js';

export default class DisplayObjectContainer extends DisplayObject {
  protected constructor() {
    super();
  }

  addChild(child: DisplayObject): DisplayObject {
    children.addChild(this.model, child.model);
    return child;
  }

  addChildAt(child: DisplayObject, index: number): DisplayObject {
    children.addChildAt(this.model, child.model, index);
    return child;
  }

  removeChild(child: DisplayObject): DisplayObject {
    children.removeChild(this.model, child.model);
    return child;
  }

  removeChildAt(index: number): DisplayObject | null {
    const model = children.removeChildAt(this.model, index);
    return getDisplayObjectFromModel(model);
  }

  removeChildren(beginIndex: number = 0, endIndex?: number): void {
    children.removeChildren(this.model, beginIndex, endIndex);
  }

  setChildIndex(child: DisplayObject, index: number): void {
    children.setChildIndex(this.model, child.model, index);
  }

  swapChildren(child1: DisplayObject, child2: DisplayObject): void {
    children.swapChildren(this.model, child1.model, child2.model);
  }

  swapChildrenAt(index1: number, index2: number): void {
    children.swapChildrenAt(this.model, index1, index2);
  }

  // Get & Set Methods

  get numChildren() {
    return this.model.children ? this.model.children.length : 0;
  }
}
