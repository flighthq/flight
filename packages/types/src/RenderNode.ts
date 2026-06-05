import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { Entity } from './Entity';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { Shader } from './Shader';

export interface RenderNode extends Entity {
  source: Renderable;
  kind: symbol;
  renderAdapter: object | null;
  next: RenderNode | null;

  alpha: number;
  appearanceFrameID: number;
  blendMode: BlendMode | null;
  colorTransform: ColorTransform;
  lastAppearanceID: number;
  lastLocalTransformID: number;
  name: string | null;
  renderer: Renderer | null;
  rendererData: RendererData | null;
  rendererDataSource: Renderable | null;
  rendererMapID: number;
  shader: Shader | null;
  transformFrameID: number;
  useColorTransform: boolean;
  visible: boolean;
}
