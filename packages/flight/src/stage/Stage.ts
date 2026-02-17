import { createStage } from '@flighthq/stage';
import type { Stage as StageLike } from '@flighthq/types';

import DisplayObject from './DisplayObject.js';

export default class Stage extends DisplayObject implements StageLike {
  declare protected __data: StageLike;

  constructor() {
    super();
    createStage(this.__data);
  }
}
