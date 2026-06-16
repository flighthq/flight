import type { BlendMode } from './BlendMode';
import type { Entity } from './Entity';
import type { Material, MaterialData } from './Material';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';

export interface RenderNode extends Entity {
  source: Renderable;
  kind: symbol;
  next: RenderNode | null;

  alpha: number;
  appearanceFrameID: number;
  blendMode: BlendMode | null;
  // Resolved material the backend renderer draws this node with, and its per-node data. Null →
  // default pipeline. Populated by the material hook during the render walk; the batcher keys on
  // `material` by reference, and material renderers read `materialData` (e.g. per-instance CT).
  material: Material | null;
  materialData: MaterialData | null;
  lastAppearanceID: number;
  lastLocalTransformID: number;
  name: string | null;
  renderer: Renderer | null;
  rendererData: RendererData | null;
  rendererDataSource: Renderable | null;
  rendererMapID: number;
  transformFrameID: number;
  visible: boolean;
}
