import { createMovieClip } from '@flighthq/stage';
import type { MovieClip as MovieClipModel } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';
import type { DisplayObjectInternal } from './internal/writeInternal.js';

export default class MovieClip extends DisplayObjectContainer {
  declare public readonly model: MovieClipModel;

  constructor() {
    super();
  }

  protected override __create(): void {
    (this as DisplayObjectInternal).model = createMovieClip();
  }
}
