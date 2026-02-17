import { createMovieClip } from '@flighthq/stage';
import type { MovieClip as MovieClipLike } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class MovieClip extends DisplayObjectContainer implements MovieClipLike {
  declare protected __data: MovieClipLike;

  constructor() {
    super();
    createMovieClip(this.__data);
  }
}
