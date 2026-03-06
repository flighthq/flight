import type { Matrix3x2 } from '../../geometry';
import type { BlendMode, ColorTransform, Shader } from '../../materials';
import type { Renderable } from './Renderable';
import type { Renderer } from './Renderer';
import type { RendererData } from './RendererData';

export interface RenderNode {
  alpha: number;
  appearanceFrameID: number;
  blendMode: BlendMode;
  cacheAsBitmap: boolean;
  cacheBitmap: RenderNode | null;
  colorTransform: ColorTransform;
  isMaskFrameID: number;
  lastAppearanceID: number;
  lastLocalTransformID: number;
  maskDepth: number;
  renderer: Renderer | null;
  rendererData: RendererData | null;
  rendererMapID: number;
  scrollRectDepth: number;
  shader: Shader | null;
  readonly source: Renderable;
  transform: Matrix3x2;
  transformFrameID: number;
  useColorTransform: boolean;
  visible: boolean;
}
