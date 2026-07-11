import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';
import type { MaterialData } from './Material';
import type { QuadTransformType } from './QuadTransformType';
import type { Rectangle } from './Rectangle';
import type { TextureAtlas } from './TextureAtlas';

export interface QuadBatchData extends DisplayObjectData {
  atlas: TextureAtlas | null;
  ids: Uint16Array;
  instanceCount: number;
  // Per-quad color transform, indexed by quad (a ColorTransform value, typed through the shared
  // MaterialData alias). Null (or a null/absent element) falls back to the node-level
  // HasColorTransform trait, so a whole-batch tint stays one uniform; per-quad values that vary
  // promote the batch to per-instance tints. Null array → no per-quad tints.
  materialData: (MaterialData | null)[] | null;
  transforms: Float32Array;
  transformType: QuadTransformType;
}

export interface QuadBatchRuntime extends DisplayObjectRuntime {
  localBoundsRectangle: Rectangle | null;
  // Per-instance velocity, interleaved as (x, y) in node units per instance: index 2*i is instance i's
  // x velocity, 2*i+1 its y. This is a batch-owned array — NOT an entry in the per-entity VelocityField —
  // because an individual quad instance is not a stable object key the field can index. Whatever drives the
  // instances (physics, tween, manual update) fills this so the velocity pass can emit per-instance motion
  // vectors instead of one coarse velocity over the whole batch. Null when no per-instance velocity is
  // tracked, in which case the velocity writer falls back to the batch's coarse world-bounds velocity.
  instanceVelocities: Float32Array | null;
}

export interface QuadBatch extends DisplayObject {
  data: QuadBatchData;
}

export const QuadBatchKind = 'QuadBatch';
