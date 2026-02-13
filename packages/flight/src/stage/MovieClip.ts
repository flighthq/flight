import type { MovieClip as MovieClipLike } from '@flighthq/types';

import Sprite from './Sprite.js';

export default class MovieClip extends Sprite implements MovieClipLike {
  constructor() {
    super();
  }
}
