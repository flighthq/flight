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

  constructor() {
    super();
    createDisplayObjectContainer(this.__data);
  }

  addChild(child: DisplayObjectLike): DisplayObjectLike {
    return children.addChild(this, child);
  }

  addChildAt(child: DisplayObjectLike, index: number): DisplayObjectLike {
    return children.addChildAt(this, child, index);
  }

  removeChild(child: DisplayObjectLike): DisplayObjectLike {
    return children.removeChild(this, child);
  }

  removeChildAt(index: number): DisplayObjectLike | null {
    return children.removeChildAt(this, index);
  }

  removeChildren(beginIndex: number = 0, endIndex?: number): void {
    children.removeChildren(this, beginIndex, endIndex);
  }

  setChildIndex(child: DisplayObjectLike, index: number): void {
    children.setChildIndex(this, child, index);
  }

  swapChildren(child1: DisplayObjectLike, child2: DisplayObjectLike): void {
    children.swapChildren(this, child1, child2);
  }

  swapChildrenAt(index1: number, index2: number): void {
    children.swapChildrenAt(this, index1, index2);
  }

  // Get & Set Methods

  get numChildren() {
    return children.getNumChildren(this.__data);
  }

  override get [DisplayObjectDerivedState.Key](): DisplayObjectContainerDerivedState {
    return this.__data[DisplayObjectDerivedState.Key] as DisplayObjectContainerDerivedState;
  }

  override set [DisplayObjectDerivedState.Key](value: DisplayObjectContainerDerivedState) {
    this.__data[DisplayObjectDerivedState.Key] = value;
  }
}

type DisplayObjectContainerDerivedState = DisplayObjectDerivedState & {
  children: DisplayObjectLike[];
};
