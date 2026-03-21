import { createSprite } from '@flighthq/scene-graph-sprite';
import type { Sprite as RawSprite, SpriteData } from '@flighthq/types';

import FlightObject from '../../../FlightObject';
import SpriteBase from './SpriteBase';

export default class Sprite extends SpriteBase {
  protected __data: SpriteData;

  constructor() {
    super();
    this.__data = this.__raw.data as SpriteData;
  }

  protected override __create() {
    return createSprite();
  }

  static fromRaw(raw: RawSprite): Sprite {
    return FlightObject.getOrCreate(raw, Sprite)!;
  }

  // Get & Set Methods

  get id(): number {
    return this.__data.id;
  }

  set id(value: number) {
    this.__data.id = value;
  }
}
