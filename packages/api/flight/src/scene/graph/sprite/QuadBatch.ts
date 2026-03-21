import { createQuadBatch } from '@flighthq/scene-graph-sprite';
import type { QuadBatch as RawQuadBatch, QuadBatchData } from '@flighthq/types';

import FlightObject from '../../../FlightObject';
import SpriteBase from './SpriteBase';

export default class QuadBatch extends SpriteBase {
  protected __data: QuadBatchData;

  constructor() {
    super();
    this.__data = this.__raw.data as QuadBatchData;
  }

  protected override __create() {
    return createQuadBatch();
  }

  static fromRaw(raw: RawQuadBatch): QuadBatch {
    return FlightObject.getOrCreate(raw, QuadBatch)!;
  }
}
