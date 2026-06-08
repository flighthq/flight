import type { QuadTransformType } from './QuadTransformType';
import type { Rectangle } from './Rectangle';
import type { SpriteNode, SpriteNodeData, SpriteNodeRuntime } from './SpriteNode';
import type { TextureAtlas } from './TextureAtlas';

export interface QuadBatchData extends SpriteNodeData {
  atlas: TextureAtlas | null;
  ids: Uint16Array;
  instanceCount: number;
  transforms: Float32Array;
  transformType: QuadTransformType;
}

export interface QuadBatchRuntime extends SpriteNodeRuntime {
  localBoundsRectangle: Rectangle | null;
}

export interface QuadBatch extends SpriteNode {
  data: QuadBatchData;
}

export const QuadBatchKind: unique symbol = Symbol('QuadBatch');
