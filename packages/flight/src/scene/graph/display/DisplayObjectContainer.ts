import * as hierarchy from '@flighthq/scene-graph-core/hierarchy';
import type { DisplayObject as DisplayObjectModel } from '@flighthq/types';

import DisplayObject from './DisplayObject.js';
import { getDisplayObjectFromModel } from './internal/displayObjectMap.js';

export default class DisplayObjectContainer extends DisplayObject {
  protected constructor() {
    super();
  }

  addChild(child: DisplayObject): DisplayObject {
    hierarchy.addChild(this._model, child.model);
    return child;
  }

  addChildAt(child: DisplayObject, index: number): DisplayObject {
    hierarchy.addChildAt(this._model, child.model, index);
    return child;
  }

  removeChild(child: DisplayObject): DisplayObject {
    hierarchy.removeChild(this._model, child.model);
    return child;
  }

  removeChildAt(index: number): DisplayObject | null {
    const model = hierarchy.removeChildAt(this._model, index);
    return getDisplayObjectFromModel(model as DisplayObjectModel);
  }

  removeChildren(beginIndex: number = 0, endIndex?: number): void {
    hierarchy.removeChildren(this._model, beginIndex, endIndex);
  }

  setChildIndex(child: DisplayObject, index: number): void {
    hierarchy.setChildIndex(this._model, child.model, index);
  }

  swapChildren(child1: DisplayObject, child2: DisplayObject): void {
    hierarchy.swapChildren(this._model, child1.model, child2.model);
  }

  swapChildrenAt(index1: number, index2: number): void {
    hierarchy.swapChildrenAt(this._model, index1, index2);
  }

  // Get & Set Methods

  get numChildren() {
    return hierarchy.getNumChildren(this._model);
  }
}
