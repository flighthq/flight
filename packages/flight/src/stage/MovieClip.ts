import { createMovieClip } from '@flighthq/stage';
import type { MovieClip as MovieClipModel } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class MovieClip extends DisplayObjectContainer {
  declare public model: MovieClipModel;

  constructor() {
    super();
  }

  protected override __create(): void {
    this.model = createMovieClip();
  }
}
