import { createStage } from '@flighthq/scene-graph-display';
import type { Stage as RawStage, StageData } from '@flighthq/types';

import FlightObject from '../../../FlightObject.js';
import DisplayObjectContainer from './DisplayObjectContainer.js';

export default class Stage extends DisplayObjectContainer {
  protected __data: StageData;
  constructor() {
    super();
    this.__data = this.__raw.data as StageData;
  }

  protected override __create() {
    return createStage();
  }

  static fromRaw(raw: RawStage): Stage {
    return FlightObject.getOrCreate(raw, Stage)!;
  }

  // Get & Set Methods

  override get raw(): RawStage {
    return this.__raw as RawStage;
  }
}
