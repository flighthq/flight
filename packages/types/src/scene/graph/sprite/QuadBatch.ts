import type { ImageSource } from '../../../assets';
import type { SpriteNode, SpriteNodeData } from './SpriteNode';

export interface QuadBatchData extends SpriteNodeData {
  image: ImageSource | null;
  indices: Int16Array | null;
  rects: Float32Array | null;
  transforms: Float32Array | null;
}

export interface QuadBatch extends SpriteNode {
  data: QuadBatchData;
}

export const QuadBatchKind: unique symbol = Symbol('QuadBatch');
