import type { MaterialData } from './Material';
import type { QuadTransformType } from './QuadTransformType';
import type { Rectangle } from './Rectangle';
import type { SpriteNode, SpriteNodeData, SpriteNodeRuntime } from './SpriteNode';
import type { TextureAtlas } from './TextureAtlas';

export interface QuadBatchData extends SpriteNodeData {
  atlas: TextureAtlas | null;
  ids: Uint16Array;
  instanceCount: number;
  // Per-quad material data, indexed by quad. Null (or a null/absent element) falls back to the
  // node-level HasMaterial.materialData, so the node's material applies uniformly. This is the
  // per-quad equivalent of materialData — e.g. a ColorTransform per quad for ColorTransformMaterial.
  materialData: (MaterialData | null)[] | null;
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
