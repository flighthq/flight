import { createStage } from '@flighthq/scene-graph-display';
import type { Stage as StageModel } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class Stage extends DisplayObjectContainer {
  declare protected _model: StageModel;

  constructor() {
    super();
  }

  protected override __create(): void {
    this._model = createStage();
  }

  // Get & Set Methods

  override get model(): StageModel {
    return this._model;
  }
}
