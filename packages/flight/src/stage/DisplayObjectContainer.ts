import { container } from '@flighthq/stage';
import { createDisplayObject } from '@flighthq/stage';
import type { DisplayObject as DisplayObjectLike } from '@flighthq/types';

import DisplayObject from './DisplayObject.js';

export default class DisplayObjectContainer extends DisplayObject implements DisplayObjectLike {
  declare protected __data: DisplayObjectLike;

  protected constructor() {
    super();
    createDisplayObject(this.__data);
  }

  addChild(child: DisplayObjectLike): DisplayObjectLike {
    return container.addChild(this, child);
  }

  addChildAt(child: DisplayObjectLike, index: number): DisplayObjectLike {
    return container.addChildAt(this, child, index);
  }

  removeChild(child: DisplayObjectLike): DisplayObjectLike {
    return container.removeChild(this, child);
  }

  removeChildAt(index: number): DisplayObjectLike | null {
    return container.removeChildAt(this, index);
  }

  removeChildren(beginIndex: number = 0, endIndex?: number): void {
    container.removeChildren(this, beginIndex, endIndex);
  }

  setChildIndex(child: DisplayObjectLike, index: number): void {
    container.setChildIndex(this, child, index);
  }

  swapChildren(child1: DisplayObjectLike, child2: DisplayObjectLike): void {
    container.swapChildren(this, child1, child2);
  }

  swapChildrenAt(index1: number, index2: number): void {
    container.swapChildrenAt(this, index1, index2);
  }

  // Get & Set Methods

  get numChildren() {
    return this.__data.children ? this.__data.children.length : 0;
  }
}
