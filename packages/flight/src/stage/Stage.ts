import { createStage } from '@flighthq/stage';
import type { Stage as StageLike } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class Stage extends DisplayObjectContainer implements StageLike {
  declare protected __data: StageLike;

  constructor() {
    super();
    createStage(this.__data);
  }
}
