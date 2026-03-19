import { createMovieClip } from '@flighthq/scene-graph-display';
import type { MovieClip as MovieClipType } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';
import type { DisplayObjectInternal } from './internal/writeInternal.js';

export default class MovieClip extends DisplayObjectContainer {
  declare public readonly value: MovieClipType;

  constructor() {
    super();
  }

  protected override __create(): void {
    (this as DisplayObjectInternal).value = createMovieClip();
  }
}
