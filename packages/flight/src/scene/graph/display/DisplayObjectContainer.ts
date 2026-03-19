import * as hierarchy from '@flighthq/scene-graph-core/hierarchy';
import type { DisplayObject as DisplayObjectType } from '@flighthq/types';

import DisplayObject from './DisplayObject.js';
import { getDisplayObjectFromType } from './internal/displayObjectMap.js';

export default class DisplayObjectContainer extends DisplayObject {
  protected constructor() {
    super();
  }

  addChild(child: DisplayObject): DisplayObject {
    hierarchy.addChild(this.value, child.value);
    return child;
  }

  addChildAt(child: DisplayObject, index: number): DisplayObject {
    hierarchy.addChildAt(this.value, child.value, index);
    return child;
  }

  removeChild(child: DisplayObject): DisplayObject {
    hierarchy.removeChild(this.value, child.value);
    return child;
  }

  removeChildAt(index: number): DisplayObject | null {
    const value = hierarchy.removeChildAt(this.value, index);
    return getDisplayObjectFromType(value as DisplayObjectType);
  }

  removeChildren(beginIndex: number = 0, endIndex?: number): void {
    hierarchy.removeChildren(this.value, beginIndex, endIndex);
  }

  setChildIndex(child: DisplayObject, index: number): void {
    hierarchy.setChildIndex(this.value, child.value, index);
  }

  swapChildren(child1: DisplayObject, child2: DisplayObject): void {
    hierarchy.swapChildren(this.value, child1.value, child2.value);
  }

  swapChildrenAt(index1: number, index2: number): void {
    hierarchy.swapChildrenAt(this.value, index1, index2);
  }

  // Get & Set Methods

  get numChildren() {
    return hierarchy.getNumChildren(this.value);
  }
}
