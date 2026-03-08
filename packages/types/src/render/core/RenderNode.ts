import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';

export interface RenderNode {
  appearanceFrameID: number;
  lastAppearanceID: number;
  lastLocalTransformID: number;
  renderer: Renderer | null;
  rendererData: RendererData | null;
  rendererMapID: number;
  readonly source: Renderable;
  visible: boolean;
}
