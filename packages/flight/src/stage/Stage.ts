import { createStage } from '@flighthq/stage';
import type { Stage as StageLike, StageData } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class Stage extends DisplayObjectContainer implements StageLike {
  declare protected __model: StageLike;

  constructor() {
    super();
  }

  protected override __create(): void {
    this.__model = createStage();
  }

  // Get & Set Methods

  override get data(): StageData {
    return this.__model.data;
  }

  override set data(value: StageData) {
    this.__model.data = value;
  }
}
