import { createStage } from '@flighthq/scene-graph-display';
import type { Stage as StageType } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';
import type { DisplayObjectInternal } from './internal/writeInternal.js';

export default class Stage extends DisplayObjectContainer {
  declare public readonly value: StageType;

  constructor() {
    super();
  }

  protected override __create(): void {
    (this as DisplayObjectInternal).value = createStage();
  }
}
