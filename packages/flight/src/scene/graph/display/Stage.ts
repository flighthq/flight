import { createStage } from '@flighthq/scene-graph-display';
import type { Stage as StageModel } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';
import type { DisplayObjectInternal } from './internal/writeInternal.js';

export default class Stage extends DisplayObjectContainer {
  declare public readonly model: StageModel;

  constructor() {
    super();
  }

  protected override __create(): void {
    (this as DisplayObjectInternal).model = createStage();
  }
}
