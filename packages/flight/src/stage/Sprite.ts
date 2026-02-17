import { createSprite } from '@flighthq/stage';
import type { Sprite as SpriteLike } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class Sprite extends DisplayObjectContainer implements SpriteLike {
  declare protected __data: SpriteLike;

  constructor() {
    super();
    createSprite(this.__data);
  }
}
