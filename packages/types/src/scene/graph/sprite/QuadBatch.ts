import type { TextureAtlas } from '../../../assets';
import type { QuadTransformType } from './QuadTransformType';
import type { SpriteNode, SpriteNodeData } from './SpriteNode';

export interface QuadBatchData extends SpriteNodeData {
  atlas: TextureAtlas | null;
  indices: Int16Array | null;
  numQuads: number;
  overrideRects: Float32Array | null;
  transforms: Float32Array | null;
  transformType: QuadTransformType;
}

export interface QuadBatch extends SpriteNode {
  data: QuadBatchData;
}

export const QuadBatchKind: unique symbol = Symbol('QuadBatch');
