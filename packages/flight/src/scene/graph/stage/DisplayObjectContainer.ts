import * as hierarchy from '@flighthq/scene-graph-core/hierarchy';
import type { DisplayObject as DisplayObjectModel } from '@flighthq/types';

import DisplayObject from './DisplayObject.js';
import { getDisplayObjectFromModel } from './internal/displayObjectMap.js';

export default class DisplayObjectContainer extends DisplayObject {
  protected constructor() {
    super();
  }

  addChild(child: DisplayObject): DisplayObject {
    hierarchy.addChild(this.model, child.model);
    return child;
  }

  addChildAt(child: DisplayObject, index: number): DisplayObject {
    hierarchy.addChildAt(this.model, child.model, index);
    return child;
  }

  removeChild(child: DisplayObject): DisplayObject {
    hierarchy.removeChild(this.model, child.model);
    return child;
  }

  removeChildAt(index: number): DisplayObject | null {
    const model = hierarchy.removeChildAt(this.model, index);
    return getDisplayObjectFromModel(model as DisplayObjectModel);
  }

  removeChildren(beginIndex: number = 0, endIndex?: number): void {
    hierarchy.removeChildren(this.model, beginIndex, endIndex);
  }

  setChildIndex(child: DisplayObject, index: number): void {
    hierarchy.setChildIndex(this.model, child.model, index);
  }

  swapChildren(child1: DisplayObject, child2: DisplayObject): void {
    hierarchy.swapChildren(this.model, child1.model, child2.model);
  }

  swapChildrenAt(index1: number, index2: number): void {
    hierarchy.swapChildrenAt(this.model, index1, index2);
  }

  // Get & Set Methods

  get numChildren() {
    return this.model.children ? this.model.children.length : 0;
  }
}
