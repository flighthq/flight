import type { DisplayObject as DisplayObjectLike } from '@flighthq/types';
import { DisplayObjectDerivedState } from '@flighthq/types';

import * as functions from '../functions/children.js';
import { createDisplayObjectContainer } from '../functions/createDisplayObjectContainer.js';
import DisplayObject from './DisplayObject.js';

export default class DisplayObjectContainer extends DisplayObject {
  override [DisplayObjectDerivedState.Key]!: DisplayObjectDerivedState & {
    children: DisplayObjectLike[];
  };

  constructor() {
    super();
    createDisplayObjectContainer(this);
  }

  addChild(child: DisplayObjectLike): DisplayObjectLike {
    return functions.addChild(this, child);
  }

  addChildAt(child: DisplayObjectLike, index: number): DisplayObjectLike {
    return functions.addChildAt(this, child, index);
  }

  removeChild(child: DisplayObjectLike): DisplayObjectLike {
    return functions.removeChild(this, child);
  }

  removeChildAt(index: number): DisplayObjectLike | null {
    return functions.removeChildAt(this, index);
  }

  removeChildren(beginIndex: number = 0, endIndex?: number): void {
    functions.removeChildren(this, beginIndex, endIndex);
  }

  setChildIndex(child: DisplayObjectLike, index: number): void {
    functions.setChildIndex(this, child, index);
  }

  swapChildren(child1: DisplayObjectLike, child2: DisplayObjectLike): void {
    functions.swapChildren(this, child1, child2);
  }

  swapChildrenAt(index1: number, index2: number): void {
    functions.swapChildrenAt(this, index1, index2);
  }

  // Get & Set Methods

  get numChildren() {
    return functions.getNumChildren(this);
  }
}
