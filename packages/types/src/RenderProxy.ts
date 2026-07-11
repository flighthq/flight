import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { Entity, Kind } from './Entity';
import type { Material, MaterialData } from './Material';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';

export interface RenderProxy extends Entity {
  source: Renderable;
  kind: Kind;
  next: RenderProxy | null;

  alpha: number;
  appearanceFrameId: number;
  blendMode: BlendMode | null;
  // Resolved node-level color transform (from the HasColorTransform trait), folded into the draw as
  // an Adjustment — a uniform for a whole-batch tint, per-instance attributes when tints vary across
  // a batch. Null → no tint. Populated by the color-transform hook during the render walk. It is NOT
  // a material and does not key the batch: a tinted and an untinted node with the same texture+blend
  // batch together, the batch promoting to the color-transform shader variant when any member is
  // tinted. Per-quad tints (QuadBatch/Tilemap) come from the source's per-quad data, overriding this.
  colorTransform: ColorTransform | null;
  // Resolved material the backend renderer draws this node with, and its per-node data. Null →
  // default pipeline. Populated by the material hook during the render walk; the batcher keys on
  // `material` by reference, and material renderers read `materialData`.
  material: Material | null;
  materialData: MaterialData | null;
  lastAppearanceId: number;
  lastLocalContentId: number;
  lastLocalTransformId: number;
  name: string | null;
  renderer: Renderer | null;
  rendererData: RendererData | null;
  rendererDataSource: Renderable | null;
  rendererMapId: number;
  transformFrameId: number;
  visible: boolean;
}
