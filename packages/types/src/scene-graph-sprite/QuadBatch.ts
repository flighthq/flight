import type { TextureAtlas } from '../../../assets';
import type { QuadTransformType } from './QuadTransformType';
import type { SpriteNode, SpriteNodeData } from './SpriteNode';

export interface QuadBatchData extends SpriteNodeData {
  atlas: TextureAtlas | null;
  ids: Uint16Array;
  instanceCount: number;
  transforms: Float32Array;
  transformType: QuadTransformType;
}

export interface QuadBatch extends SpriteNode {
  data: QuadBatchData;
}

export const QuadBatchKind: unique symbol = Symbol('QuadBatch');
