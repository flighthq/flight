import { createMovieClip } from '@flighthq/scene-graph-display';
import type { MovieClip as MovieClipModel } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class MovieClip extends DisplayObjectContainer {
  declare protected _model: MovieClipModel;

  constructor() {
    super();
  }

  protected override __create(): void {
    this._model = createMovieClip();
  }

  // Get & Set Methods

  override get model(): MovieClipModel {
    return this._model;
  }
}
