import * as hierarchy from '@flighthq/scene-graph-core/hierarchy';

import FlightObject from '../../../FlightObject.js';
import DisplayObject from './DisplayObject.js';

export default class DisplayContainer extends DisplayObject {
  protected constructor() {
    super();
  }

  addChild(child: DisplayObject): DisplayObject {
    hierarchy.addChild(this.__raw, child.raw);
    return child;
  }

  addChildAt(child: DisplayObject, index: number): DisplayObject {
    hierarchy.addChildAt(this.__raw, child.raw, index);
    return child;
  }

  removeChild(child: DisplayObject): DisplayObject {
    hierarchy.removeChild(this.__raw, child.raw);
    return child;
  }

  removeChildAt(index: number): DisplayObject | null {
    const raw = hierarchy.removeChildAt(this.__raw, index);
    return FlightObject.get(raw);
  }

  removeChildren(beginIndex: number = 0, endIndex?: number): void {
    hierarchy.removeChildren(this.__raw, beginIndex, endIndex);
  }

  setChildIndex(child: DisplayObject, index: number): void {
    hierarchy.setChildIndex(this.__raw, child.raw, index);
  }

  swapChildren(child1: DisplayObject, child2: DisplayObject): void {
    hierarchy.swapChildren(this.__raw, child1.raw, child2.raw);
  }

  swapChildrenAt(index1: number, index2: number): void {
    hierarchy.swapChildrenAt(this.__raw, index1, index2);
  }

  // Get & Set Methods

  get numChildren() {
    return hierarchy.getNumChildren(this.__raw);
  }
}
