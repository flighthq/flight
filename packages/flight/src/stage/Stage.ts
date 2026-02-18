import { createStage } from '@flighthq/stage';
import type { Stage as StageLike } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class Stage extends DisplayObjectContainer implements StageLike {
  declare protected __model: StageLike;

  constructor() {
    super();
  }

  protected override __create(): void {
    this.__model = createStage();
  }
}
