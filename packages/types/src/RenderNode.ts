import type { BlendMode } from './BlendMode';
import type { ColorTransform } from './ColorTransform';
import type { Entity } from './Entity';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';
import type { Shader } from './Shader';

export interface RenderNode extends Entity {
  alpha: number;
  blendMode: BlendMode | null;
  appearanceFrameID: number;
  colorTransform: ColorTransform;
  lastAppearanceID: number;
  lastLocalTransformID: number;
  renderer: Renderer | null;
  rendererData: RendererData | null;
  rendererMapID: number;
  shader: Shader | null;
  readonly source: Renderable;
  transformFrameID: number;
  useColorTransform: boolean;
  visible: boolean;
}
