import type { SpriteBase, SpriteBaseData } from './SpriteBase';

export interface QuadBatchData extends SpriteBaseData {
  indices: Int16Array | null;
  rects: Float32Array | null;
  transforms: Float32Array | null;
}

export interface QuadBatch extends SpriteBase {
  data: QuadBatchData;
}

export const QuadBatchKind: unique symbol = Symbol('QuadBatch');
