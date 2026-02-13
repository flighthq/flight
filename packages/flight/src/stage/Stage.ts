import type { Stage as StageLike } from '@flighthq/types';

import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class Stage extends DisplayObjectContainer implements StageLike {
  constructor() {
    super();
  }
}
