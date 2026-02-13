import { children } from '@flighthq/stage';
import { createDisplayObjectContainer } from '@flighthq/stage';
import type {
  DisplayObject as DisplayObjectLike,
  DisplayObjectContainer as DisplayObjectContainerLike,
} from '@flighthq/types';
import { DisplayObjectDerivedState } from '@flighthq/types';

import DisplayObject from './DisplayObject.js';

export default class DisplayObjectContainer extends DisplayObject implements DisplayObjectContainerLike {
  declare protected __data: DisplayObjectContainerLike;

  override [DisplayObjectDerivedState.Key]!: DisplayObjectDerivedState & {
    children: DisplayObjectLike[];
  };

  constructor() {
    super();
    createDisplayObjectContainer(this.__data);
  }

  addChild(child: DisplayObjectLike): DisplayObjectLike {
    return children.addChild(this.__data, child);
  }

  addChildAt(child: DisplayObjectLike, index: number): DisplayObjectLike {
    return children.addChildAt(this.__data, child, index);
  }

  removeChild(child: DisplayObjectLike): DisplayObjectLike {
    return children.removeChild(this.__data, child);
  }

  removeChildAt(index: number): DisplayObjectLike | null {
    return children.removeChildAt(this.__data, index);
  }

  removeChildren(beginIndex: number = 0, endIndex?: number): void {
    children.removeChildren(this.__data, beginIndex, endIndex);
  }

  setChildIndex(child: DisplayObjectLike, index: number): void {
    children.setChildIndex(this.__data, child, index);
  }

  swapChildren(child1: DisplayObjectLike, child2: DisplayObjectLike): void {
    children.swapChildren(this.__data, child1, child2);
  }

  swapChildrenAt(index1: number, index2: number): void {
    children.swapChildrenAt(this.__data, index1, index2);
  }

  // Get & Set Methods

  get numChildren() {
    return children.getNumChildren(this.__data);
  }
}
