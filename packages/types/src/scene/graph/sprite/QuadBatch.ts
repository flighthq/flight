import type { SpriteBase } from './SpriteBase';

export interface QuadBatch extends SpriteBase {
  indices: Int16Array | null;
  rects: Float32Array | null;
  transforms: Float32Array | null;
}
