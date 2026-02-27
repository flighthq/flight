import { createStage } from '@flighthq/stage';
import type { Stage as StageModel } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class Stage extends DisplayObjectContainer {
  declare public model: StageModel;

  constructor() {
    super();
  }

  protected override __create(): void {
    this.model = createStage();
  }
}
