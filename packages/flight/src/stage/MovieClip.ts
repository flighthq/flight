import { createMovieClip } from '@flighthq/stage';
import type { MovieClip as MovieClipLike } from '@flighthq/types';

import Sprite from './Sprite.js';

export default class MovieClip extends Sprite implements MovieClipLike {
  declare protected __data: MovieClipLike;

  constructor() {
    super();
    createMovieClip(this.__data);
  }
}
