import { createQuadBatch, resizeQuadBatch } from '@flighthq/scene-graph-sprite';
import type { QuadBatch as RawQuadBatch, QuadBatchData, QuadTransformType } from '@flighthq/types';

import { TextureAtlas } from '../../../assets';
import FlightObject from '../../../FlightObject';
import SpriteNode from './SpriteNode';

export default class QuadBatch extends SpriteNode {
  protected __data: QuadBatchData;
  declare protected __raw: RawQuadBatch;

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

  resize(numQuads: number): void {
    resizeQuadBatch(this.__raw, numQuads);
  }

  // Get & Set Methods

  get atlas(): TextureAtlas | null {
    if (this.__data.atlas === null) return null;
    return FlightObject.getOrCreate(this.__data.atlas, TextureAtlas);
  }

  set atlas(value: TextureAtlas | null) {
    this.__data.atlas = value !== null ? value.raw : null;
  }

  get indices(): Int16Array | null {
    return this.__data.indices;
  }

  set indices(value: Int16Array | null) {
    this.__data.indices = value;
  }

  get numQuads(): number {
    return this.__data.numQuads;
  }

  set numQuads(value: number) {
    this.__data.numQuads = value;
  }

  get overrideRects(): Float32Array | null {
    return this.__data.overrideRects;
  }

  set overrideRects(value: Float32Array | null) {
    this.__data.overrideRects = value;
  }

  override get raw(): RawQuadBatch {
    return this.__raw;
  }

  get transforms(): Float32Array | null {
    return this.__data.transforms;
  }

  set transforms(value: Float32Array | null) {
    this.__data.transforms = value;
  }

  get transformType(): 
}

export { QuadTransformType };
