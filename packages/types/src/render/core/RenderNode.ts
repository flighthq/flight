import type { BlendMode, ColorTransform, Shader } from '../../materials';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';

export interface RenderNode {
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
