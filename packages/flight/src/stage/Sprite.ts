import { createSprite } from '@flighthq/stage';
import type { Sprite as SpriteLike } from '@flighthq/types';

import DisplayObject from './DisplayObject.js';

export default class Sprite extends DisplayObject implements SpriteLike {
  declare protected __data: SpriteLike;

  constructor() {
    super();
    createSprite(this.__data);
  }
}
