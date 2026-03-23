import * as hierarchy from '@flighthq/scene-graph-core/hierarchy';
import { createSprite } from '@flighthq/scene-graph-sprite';
import type { Sprite as RawSprite, SpriteData } from '@flighthq/types';

import FlightObject from '../../../FlightObject';
import SpriteNode from './SpriteNode';

export default class Sprite extends SpriteNode {
  protected __data: SpriteData;

  constructor() {
    super();
    this.__data = this.__raw.data as SpriteData;
  }

  protected override __create() {
    return createSprite();
  }

  addChild(child: SpriteNode): SpriteNode {
    hierarchy.addChild(this.__raw, child.raw);
    return child;
  }

  addChildAt(child: SpriteNode, index: number): SpriteNode {
    hierarchy.addChildAt(this.__raw, child.raw, index);
    return child;
  }

  static fromRaw(raw: RawSprite): Sprite {
    return FlightObject.getOrCreate(raw, Sprite)!;
  }

  removeChild(child: SpriteNode): SpriteNode {
    hierarchy.removeChild(this.__raw, child.raw);
    return child;
  }

  removeChildAt(index: number): SpriteNode | null {
    const raw = hierarchy.removeChildAt(this.__raw, index);
    return FlightObject.get(raw);
  }

  removeChildren(beginIndex: number = 0, endIndex?: number): void {
    hierarchy.removeChildren(this.__raw, beginIndex, endIndex);
  }

  setChildIndex(child: SpriteNode, index: number): void {
    hierarchy.setChildIndex(this.__raw, child.raw, index);
  }

  swapChildren(child1: SpriteNode, child2: SpriteNode): void {
    hierarchy.swapChildren(this.__raw, child1.raw, child2.raw);
  }

  swapChildrenAt(index1: number, index2: number): void {
    hierarchy.swapChildrenAt(this.__raw, index1, index2);
  }

  // Get & Set Methods

  get id(): number {
    return this.__data.id;
  }

  set id(value: number) {
    this.__data.id = value;
  }

  get numChildren() {
    return hierarchy.getNumChildren(this.__raw);
  }
}
