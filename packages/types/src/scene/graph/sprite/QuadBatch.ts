import type { SpriteBase } from './SpriteBase';

export interface QuadBatch extends SpriteBase {
  indices: Int16Array | null;
  quadCount: number;
  transforms: Float32Array | null;
  vertexData: Float32Array | null;
}
